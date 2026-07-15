"use server";
/**
 * DIVA — the console operator. Two server actions:
 *   divaPlan(command)      → LLM turns a voice/text command into an ordered list of steps.
 *   divaRun(tool, args)    → executes ONE step (read / navigate / mutate), permission-checked.
 *
 * Owner is logged in via the console passcode → DIVA gets ALL permissions. The granular
 * gate is wired so per-staff roles can scope DIVA later.
 */
import { aiChat, anyAiConfigured } from "@/lib/ai/providers";
import { supabaseServer } from "@/lib/supabase/server";
import {
  getChannelReport, getInventoryClassified, getProductsPage, getDashboardData, getStorefront,
  getProductBySku, getProductSalesStats, getCustomersDb, getPricingFormula,
} from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { liveOffer } from "@/lib/offers";
import { DIVA_TOOLS, PAGE_MAP, toolByName } from "@/lib/diva/tools";
import { interpret, type DivaContext } from "@/lib/diva/nlu";
import { requirePerm } from "@/lib/auth";
import { generateContentAction } from "@/app/actions/aiContent";
import { generateOneAction, generateAdImageAction } from "@/app/actions/images";
import { computePrices, isValidPriceSet } from "@/lib/pricing";
import { createProductAction, createCategoryJsonAction } from "@/app/actions/catalog";
import { orderDuePaise, isDeadOrder } from "@/lib/business";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/audit";

export type DivaStep = { tool: string; args: Record<string, any>; label: string; kind: string; needsConfirm: boolean };
export type DivaPlan = {
  ok: boolean;
  reply: string;
  steps: DivaStep[];
  /** A clarifying question DIVA needs answered before it can act (multi-turn). */
  ask?: { slot: string; prompt: string };
  /** Conversational memory to echo back on the next turn (serialised). */
  context?: string;
};

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Wrap NLU steps into executable DivaSteps (attaching tool kind + confirm flag). */
function toDivaSteps(steps: { tool: string; args: Record<string, any>; label: string }[]): DivaStep[] {
  const out: DivaStep[] = [];
  for (const s of steps) {
    const tool = toolByName(s.tool);
    if (!tool) continue;
    out.push({ tool: tool.name, args: s.args ?? {}, label: s.label.slice(0, 80), kind: tool.kind, needsConfirm: !!tool.confirm });
  }
  return out;
}

/** Authoritative (DB-backed) check that the current session may run a tool needing `perm`. */
async function sessionCan(perm?: string): Promise<boolean> {
  if (!perm) return true;
  return requirePerm(perm);
}

function isoDaysAgo(d: number) { return new Date(Date.now() - d * 86400000).toISOString(); }

// ---------------------------------------------------------------- PLAN
/**
 * Turn a (possibly Hindi/Hinglish) command into an ordered, executable plan.
 *
 * Strategy:
 *   1. Run the deterministic multilingual NLU engine (lib/diva/nlu) — fast, free, offline,
 *      and the only path that works when no AI key is configured or the network is blocked.
 *   2. If NLU is confident (or it needs a follow-up answer, or no LLM is configured) → use it.
 *   3. Otherwise escalate the same command to the LLM for a best-effort plan, falling back
 *      to whatever the NLU produced.
 *
 * `contextJson` carries conversational memory from the previous turn (multi-turn slot fill,
 * "ye product" references). It is produced by this function and echoed back by the widget.
 */
export async function divaPlan(command: string, contextJson?: string): Promise<DivaPlan> {
  const cmd = (command ?? "").trim().slice(0, 600);
  if (!cmd) return { ok: false, reply: "Tell me what you'd like done — e.g. “show me this week's sales” or “add 20 pieces to AJ1004”.", steps: [] };

  let prevCtx: DivaContext = {};
  if (contextJson) { try { prevCtx = JSON.parse(contextJson); } catch { /* ignore bad context */ } }

  // 1) Deterministic multilingual engine.
  const nlu = interpret(cmd, prevCtx);
  const nluPlan: DivaPlan = {
    ok: true, reply: nlu.reply, steps: toDivaSteps(nlu.steps),
    ask: nlu.ask, context: JSON.stringify(nlu.context),
  };

  // 2) Trust the fast deterministic engine ONLY when it's safe:
  //    - it asked a clarifying question, or
  //    - no LLM is configured (best effort), or
  //    - it produced steps that are read/navigate only (harmless), or
  //    - it produced steps and is highly confident.
  //    A low/medium-confidence MUTATION is escalated to the LLM so a mis-parse like
  //    "billvan WH17 gold" never silently runs the wrong change (Aggarwal's complaint).
  const llmAvailable = anyAiConfigured();
  if (nlu.ask || !llmAvailable) return nluPlan;
  const mutating = nluPlan.steps.some((s) => s.kind === "mutate");
  // Reads need a minimum confidence too — a low-confidence guess (e.g. a vague find_product
  // fallback) is escalated to the LLM rather than silently shown as a confident answer.
  const minConf = mutating ? 0.72 : 0.55;
  if (nluPlan.steps.length > 0 && nlu.confidence >= minConf) return nluPlan;

  // 3) Low confidence + LLM available → ask the model, keep NLU context as memory.
  // Business memory — rules the owner told DIVA to remember (best-effort; migration 0042).
  let memoryNotes = "";
  try {
    const { data: mem } = await supabaseServer().from("diva_memory").select("note").order("created_at", { ascending: false }).limit(8);
    if (mem && mem.length) memoryNotes = `\nOwner rules to respect (business memory):\n${(mem as any[]).map((m) => `- ${m.note}`).join("\n")}`;
  } catch { /* memory table is optional */ }

  const catalog = DIVA_TOOLS.map((t) => `- ${t.name}(${t.params.map((p) => p.name + (p.required ? "*" : "")).join(", ")}) [${t.kind}] — ${t.desc}`).join("\n");
  const system =
    `You are DIVA, the operations agent inside the Aggarwal Jewellers artificial-jewellery admin console (Aggarwal Jewellers, Sadar Bazar, Delhi). ` +
    `The console manages a catalogue of products (each has a SKU like AJ1000, a price, stock, status published/draft, AI page, photos), ` +
    `online + wholesale + counter(POS) sales, estimates, purchases, suppliers, inventory health, staff roles, and analytics. ` +
    `Turn the owner's command into an ordered plan using ONLY these tools:\n${catalog}\n\n` +
    `Rules: break the request into the minimum number of concrete steps; each step is one tool with its args. ` +
    `Use open_page to navigate when they say go to / open / show a section. Use read tools to answer questions. ` +
    `Use mutate tools only when they clearly ask to change something. SKUs look like AJ1234 — pass them uppercased. ` +
    `"hide"/"take off the store"=hide_product; "show"/"put back"=show_product; "delete/remove a product"=delete_product. ` +
    `Match a product by SKU (BD####) OR by any detail hint (name, colour, category, keywords) — when no SKU is given, pass the hint as "query" to the *_by_name / *_of / set_stock / product_photos / last_purchase tools. ` +
    `Tool hints: "stock N kar do"/"set stock to N"=set_stock (exact total); "N add/kam"=add_stock/remove_stock; variants=add_variant/list_variants; product photos=product_photos (or generate_photo to create one); recent bills/invoices=recent_sales; convert a cash memo to GST=convert_invoice; last purchase cost=last_purchase; categories=list_categories; create page/product=create_product. ` +
    `VOICE-NOTE PRODUCT FACTORY: the owner may dictate MANY products in ONE message ("gold jhumka 50 piece cost 80, oxidised kada 30 piece 120, ..."). Emit ONE create_product step per product: {name (title-case the spoken name), category, price (the cost/rate number in rupees), qty (the piece count)}. Infer category from the type word: jhumka/jhumki/bali/earring=Earrings; kada/bracelet/bangle=Bracelets; ring/anguthi=Rings; necklace/haar/set/choker/mala=Necklaces; payal/anklet=Anklets; tikka/mangtika=Maang Tikka; nath/nosepin=Nose Pins. If they also ask for photos, append generate_ad_images {"scope":"missing"}; if they say publish/live karo, append publish_products {"scope":"photos"}. `+
    `CLARITY: if you are unsure which product they mean, or multiple could match, or a required value (quantity, price, name, category) is missing, DO NOT guess — return EMPTY steps and ask ONE short clarifying question in "reply". Once it is clear, act. ` +
    `Examples:\n` +
    `"3 naye product: gold jhumka 50 piece cost 80, oxidised kada 30 piece 120, pearl ring 20 piece 60 — photos bhi bana dena" -> [{"tool":"create_product","args":{"name":"Gold Jhumka","category":"Earrings","price":80,"qty":50}},{"tool":"create_product","args":{"name":"Oxidised Kada","category":"Bracelets","price":120,"qty":30}},{"tool":"create_product","args":{"name":"Pearl Ring","category":"Rings","price":60,"qty":20}},{"tool":"generate_ad_images","args":{"scope":"missing"}}]\n` +
    `"how's AJ1004 doing?" -> [{"tool":"product_analytics","args":{"sku":"AJ1004"},"label":"Analyse AJ1004"}]\n` +
    `"hide the polki choker AJ1003 and tell me sales this week" -> [{"tool":"hide_product","args":{"sku":"AJ1003"}},{"tool":"analyze_sales","args":{"days":7}}]\n` +
    `"add 30 to AJ1010 then open inventory" -> [{"tool":"add_stock","args":{"sku":"AJ1010","qty":30}},{"tool":"open_page","args":{"page":"inventory"}}]\n\n` +
    `Respond ONLY as compact JSON: {"reply": "<one friendly sentence>", "steps": [{"tool":"<name>","args":{...},"label":"<short label>"}]}. ` +
    `If nothing matches, return empty steps and explain in reply.` + memoryNotes;

  let parsed: any = null;
  try {
    // Task-based routing with cascading fallback: mutations need the strongest
    // reasoning; very long commands go to the large-context model; quick lookups
    // go to the fastest. aiChat() tries the next provider automatically on failure.
    const task = mutating ? "reasoning" : cmd.length > 320 ? "context" : "fast";
    const { text: raw } = await aiChat(task, { system, user: cmd, json: true });
    parsed = JSON.parse(raw);
  } catch {
    return nluPlan;
  }

  const steps: DivaStep[] = [];
  for (const s of Array.isArray(parsed?.steps) ? parsed.steps : []) {
    const tool = toolByName(String(s?.tool));
    if (!tool) continue;
    steps.push({ tool: tool.name, args: s?.args ?? {}, label: String(s?.label ?? tool.desc).slice(0, 80), kind: tool.kind, needsConfirm: !!tool.confirm });
  }
  if (steps.length === 0) return { ...nluPlan, reply: String(parsed?.reply ?? nluPlan.reply).slice(0, 200) };
  return { ok: true, reply: String(parsed?.reply ?? "On it.").slice(0, 200), steps, context: nluPlan.context };
}

// ---------------------------------------------------------------- SUGGESTIONS
export type DivaSuggestion = { id: string; icon: string; text: string; command: string };

/**
 * Proactive, context-aware suggestions DIVA offers when idle (Phase 7).
 * Each suggestion carries a natural-language `command` that flows back through
 * divaPlan → divaRun, so clicking one is the same as typing it. Best-effort &
 * non-throwing — a data hiccup just yields fewer chips.
 */
export async function getDivaSuggestions(): Promise<DivaSuggestion[]> {
  const out: DivaSuggestion[] = [];
  try {
    const sb = supabaseServer();
    const [classified, draftsRes, pendingRes, lowVarRes] = await Promise.all([
      getInventoryClassified().catch(() => [] as any[]),
      getProductsPage({ status: "draft", pageSize: 3 }).catch(() => ({ rows: [] as any[] })),
      sb.from("orders").select("id", { count: "exact", head: true }).not("status", "in", "(completed,delivered,cancelled,refunded)"),
      sb.from("variants").select("color,sku,qty,product:products(name,sku)").lte("qty", 3).order("qty", { ascending: true }).limit(5),
    ]);

    const rows = (classified as any[]) ?? [];
    const oos = rows.filter((r) => (r.qty ?? 0) <= 0);
    const low = rows.filter((r) => r.cls === "low" && (r.qty ?? 0) > 0);
    const dead = rows.filter((r) => r.cls === "dead" && (r.qty ?? 0) > 0);

    if (oos.length) {
      const r = oos[0];
      out.push({ id: "oos", icon: "🚨", text: `${r.name} (${r.sku}) is out of stock${oos.length > 1 ? ` — and ${oos.length - 1} more` : ""}. Restock it?`, command: `add 10 to ${r.sku}` });
    }
    if (low.length) {
      const r = low[0];
      out.push({ id: "low", icon: "📉", text: `${r.name} (${r.sku}) is low — only ${r.qty} left. Add stock?`, command: `add 20 to ${r.sku}` });
    }
    // Colour-level alert (colour-first model): flag a specific colour running low/out.
    const lowVars = ((lowVarRes as any)?.data ?? []) as any[];
    if (lowVars.length) {
      const v = lowVars[0];
      const pname = v.product?.name ?? v.product?.sku ?? "A product";
      const psku = v.product?.sku ?? "";
      out.push({ id: "lowvar", icon: "🎨",
        text: `${pname} ${v.color} ${(v.qty ?? 0) <= 0 ? "is out" : `is low (${v.qty} left)`}${lowVars.length > 1 ? ` — +${lowVars.length - 1} more colours` : ""}. Restock?`,
        command: psku ? `${psku} me 12 ${v.color} add karo` : "low stock dikhao" });
    }
    const pending = (pendingRes as any)?.count ?? 0;
    if (pending > 0) out.push({ id: "pending", icon: "📦", text: `${pending} pending order${pending > 1 ? "s" : ""} to review.`, command: "pending orders dikhao" });

    const drafts = ((draftsRes as any)?.rows ?? []) as any[];
    if (drafts.length) {
      const r = drafts[0];
      out.push({ id: "draft", icon: "✏️", text: `${r.name} (${r.sku}) is still a draft — open it to finish & publish?`, command: `show ${r.sku}` });
    }
    if (drafts.length >= 2) {
      out.push({ id: "factory", icon: "🏭", text: `${drafts.length} naye products draft me hain — AI photos bana ke publish kar dun?`, command: "sab naye products ki photos banao" });
    }
    if (dead.length) {
      const r = dead[0];
      out.push({ id: "dead", icon: "💤", text: `${r.name} hasn't sold lately — share its catalogue to push it?`, command: `${r.name} ka catalog whatsapp pe bhejo` });
    }
  } catch { /* suggestions are best-effort */ }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- RUN
export type DivaResult = { ok: boolean; message: string; navigate?: string; data?: any; denied?: boolean };

export async function divaRun(toolName: string, args: Record<string, any>): Promise<DivaResult> {
  const tool = toolByName(toolName);
  if (!tool) return { ok: false, message: "Unknown action." };
  if (!(await sessionCan(tool.permission))) return { ok: false, denied: true, message: `Your role doesn't have permission for ${tool.name}.` };

  const __res = await (async (): Promise<DivaResult> => {
  try {
    switch (toolName) {
      case "open_page": {
        const key = String(args.page ?? "").toLowerCase().trim();
        const path = PAGE_MAP[key] ?? Object.entries(PAGE_MAP).find(([k]) => key.includes(k) || k.includes(key))?.[1];
        if (!path) return { ok: false, message: `I don't know a page called "${args.page}".` };
        return { ok: true, message: `Opening ${key}…`, navigate: path };
      }
      case "business_summary": {
        const days = Number(args.days) || 30;
        const from = isoDaysAgo(days), to = new Date().toISOString();
        const d = await getDashboardData(from, to);
        const rep = await getChannelReport(from, to);
        const top = rep.channels.sort((a, b) => b.revenue - a.revenue)[0];
        return { ok: true, data: d, message: `Last ${days} days: ${formatPaise(d.revenue)} across ${d.orders} orders. Best channel: ${top?.channel ?? "—"}. Stock alerts: ${d.dead} dead, ${d.low} low. Products: ${d.totalProducts}.` };
      }
      case "analyze_sales": {
        const days = Number(args.days) || 30;
        const rep = await getChannelReport(isoDaysAgo(days), new Date().toISOString());
        const parts = rep.channels.map((c) => `${c.channel} ${formatPaise(c.revenue)} (${c.count})`).join(" · ");
        return { ok: true, data: rep, message: `Last ${days} days — total ${formatPaise(rep.grand)} from ${rep.count} orders. By channel: ${parts}.` };
      }
      case "inventory_status": {
        const rows = await getInventoryClassified();
        const dead = rows.filter((r) => r.cls === "dead"), low = rows.filter((r) => r.cls === "low");
        const worst = dead.slice(0, 5).map((r) => `${r.name} (${r.qty})`).join(", ") || "none";
        return { ok: true, data: { dead: dead.length, low: low.length }, message: `${dead.length} dead, ${low.length} low, ${rows.length} total. Worst dead stock: ${worst}.` };
      }
      case "low_stock": {
        const rows = await getInventoryClassified();
        const list = rows.filter((r) => r.cls === "low" || r.qty === 0).slice(0, 12);
        return { ok: true, data: list, message: list.length ? `Low/out: ${list.map((r) => `${r.name} (${r.qty})`).join(", ")}.` : "Nothing is low right now 🎉" };
      }
      case "find_product": {
        const { rows } = await getProductsPage({ q: String(args.query ?? ""), pageSize: 8 });
        const { formula } = await getStorefront();
        if (rows.length === 0) return { ok: true, message: `No products matched "${args.query}".` };
        const list = rows.map((p: any) => `${p.name} (${p.sku}) — ${formatPaise(liveOffer(p.base_wholesale, formula).price)}, ${p.qty} in stock`).join("; ");
        return { ok: true, data: rows, message: list };
      }
      case "add_stock":
      case "remove_stock": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const qty = Math.abs(Math.trunc(Number(args.qty) || 0));
        if (!sku || !qty) return { ok: false, message: "I need a SKU and a quantity." };
        const delta = toolName === "add_stock" ? qty : -qty;
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,qty,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const pid = (p as any).id;
        const { data: vrows } = await sb.from("variants").select("id,color,sku,qty").eq("product_id", pid);
        const variants = (vrows as any[]) ?? [];
        // Colour-first: a product with colours is adjusted per colour, never as a whole.
        if (variants.length) {
          const v = matchVariant(variants, String(args.color ?? ""));
          if (!v) return { ok: false, message: `Which colour? ${(p as any).name} has: ${variants.map((x) => x.color).filter(Boolean).join(", ")}.` };
          const newV = Math.max(0, (v.qty ?? 0) + delta);
          await sb.from("variants").update({ qty: newV }).eq("id", v.id);
          const sum = variants.reduce((n, x) => n + (x.id === v.id ? newV : (x.qty ?? 0)), 0);
          await sb.from("products").update({ qty: sum, last_movement_at: new Date().toISOString() }).eq("id", pid);
          await sb.from("stock_adjustments").insert({ product_id: pid, variant_id: v.id, sku: v.sku, delta, kind: "adjustment", source: String(args.source ?? "DIVA command"), reason: `${toolName === "add_stock" ? "Added to" : "Removed from"} ${v.color} by DIVA` });
          revalidatePath("/admin/inventory");
          return { ok: true, message: `${toolName === "add_stock" ? "Added" : "Removed"} ${qty} ${v.color} — ${(p as any).name} ${v.color} is now ${newV} (total ${sum}).` };
        }
        const newQty = Math.max(0, ((p as any).qty ?? 0) + delta);
        await sb.from("products").update({ qty: newQty, last_movement_at: new Date().toISOString() }).eq("id", pid);
        await sb.from("stock_adjustments").insert({ product_id: pid, sku, delta, kind: "adjustment", source: String(args.source ?? "DIVA command"), reason: "Adjusted by DIVA" });
        revalidatePath("/admin/inventory");
        return { ok: true, message: `${toolName === "add_stock" ? "Added" : "Removed"} ${qty} — ${(p as any).name} is now ${newQty} in stock.` };
      }
      case "product_details": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const p = await getProductBySku(sku);
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const { formula } = await getStorefront();
        const o = liveOffer(p.base_wholesale, formula);
        const gc = (p.generated_content as any) ?? {};
        const tags = (gc.tags ?? []).slice(0, 6).join(", ");
        const photos = (p.images ?? []).length;
        return { ok: true, data: p, message: `${p.name} (${sku}) — ${p.category?.name}. Price ${formatPaise(o.price)} (MRP ${formatPaise(o.mrp)}). Stock ${p.qty}. Status ${p.status}. ${photos} photo(s). Tags: ${tags || "none"}.` };
      }
      case "product_analytics": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const s = await getProductSalesStats(sku);
        if (!s) return { ok: false, message: `No product with SKU ${sku}.` };
        return { ok: true, data: s, message: `${s.name} (${sku}): ${s.units} units sold across ${s.orders} orders, ${formatPaise(s.revenue)} revenue. Currently ${s.stock} in stock, status ${s.status}.` };
      }
      case "generate_ai_content": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        if (!sku) return { ok: false, message: "Which SKU?" };
        const r = await generateContentAction(sku);
        revalidatePath("/admin/catalogue");
        return { ok: r.ok, message: r.ok ? `Regenerated the AI product page for ${sku}.` : `Couldn't write the page for ${sku}.` };
      }
      case "generate_photo": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        if (!sku) return { ok: false, message: "Which SKU?" };
        const r = await generateOneAction(sku);
        revalidatePath("/admin/catalogue"); revalidatePath("/admin/media");
        return { ok: r.ok, message: r.ok ? `Generated a model photo for ${sku}.` : `Couldn't generate a photo for ${sku} (${r.reason ?? "error"}).` };
      }
      case "hide_product":
      case "show_product": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        if (!sku) return { ok: false, message: "Which SKU?" };
        const status = toolName === "show_product" ? "published" : "draft";
        const sb = supabaseServer();
        const { error } = await sb.from("products").update({ status }).eq("sku", sku);
        if (error) return { ok: false, message: error.message };
        await logActivity({ action: status === "published" ? "product_shown" : "product_hidden", ref: sku, detail: `${sku} ${status === "published" ? "shown on" : "hidden from"} the store (via DIVA).` });
        revalidatePath("/admin/catalogue"); revalidatePath("/shop");
        return { ok: true, message: `${sku} is now ${status === "published" ? "visible on the store" : "hidden from the store"}.` };
      }
      case "delete_product": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        if (!sku) return { ok: false, message: "Which SKU?" };
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const pid = (p as any).id;
        await sb.from("product_images").delete().eq("product_id", pid);
        await sb.from("variants").delete().eq("product_id", pid);
        const { error } = await sb.from("products").delete().eq("id", pid);
        revalidatePath("/admin/catalogue"); revalidatePath("/shop");
        if (error) {
          // Has past orders → can't hard-delete; hide instead.
          await sb.from("products").update({ status: "draft" }).eq("id", pid);
          await logActivity({ action: "product_hidden", ref: sku, detail: `${(p as any).name} (${sku}) has past orders — hidden instead of deleted (via DIVA).` });
          return { ok: true, message: `${sku} has past orders, so I hid it from the store instead of deleting (keeps your books intact).` };
        }
        await logActivity({ action: "product_deleted", ref: sku, detail: `Deleted ${(p as any).name} (${sku}) via DIVA.` });
        return { ok: true, message: `Deleted ${(p as any).name} (${sku}).` };
      }
      case "delete_role": {
        const name = String(args.name ?? "").trim();
        if (!name) return { ok: false, message: "Which role?" };
        const sb = supabaseServer();
        const { data: role } = await sb.from("roles").select("id,name").ilike("name", name).maybeSingle();
        if (!role) return { ok: false, message: `No role called "${name}".` };
        await sb.from("roles").delete().eq("id", (role as any).id);
        revalidatePath("/admin/roles");
        return { ok: true, message: `Deleted the "${(role as any).name}" role.` };
      }

      // -------- intelligence-layer executors (multilingual DIVA) --------
      case "get_price": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const p = sku ? await getProductBySku(sku) : await resolveProductByName(String(args.query ?? ""));
        if (!p) return { ok: false, message: `I couldn't find ${sku || `"${args.query}"`}.` };
        const { formula } = await getStorefront();
        const o = liveOffer(p.base_wholesale, formula);
        const tier = String(args.tier ?? "all");
        const wholesale = formatPaise(p.base_wholesale);
        if (tier === "wholesale") return { ok: true, data: p, message: `${p.name} (${p.sku}) wholesale price is ${wholesale}.` };
        if (tier === "retail") return { ok: true, data: p, message: `${p.name} (${p.sku}) retail price is ${formatPaise(o.price)}.` };
        if (tier === "mrp") return { ok: true, data: p, message: `${p.name} (${p.sku}) MRP is ${formatPaise(o.mrp)}.` };
        return { ok: true, data: p, message: `${p.name} (${p.sku}) — Wholesale ${wholesale} · Retail ${formatPaise(o.price)} · MRP ${formatPaise(o.mrp)}.` };
      }
      case "inventory_of": {
        const p = await resolveProductByName(String(args.query ?? ""));
        if (!p) return { ok: false, message: `I couldn't match "${args.query}" to a product. Try the SKU.` };
        const cls = p.qty === 0 ? "out of stock" : p.qty <= 2 ? "low" : "healthy";
        return { ok: true, data: p, message: `${p.name} (${p.sku}) has ${p.qty} in stock (${cls}).` };
      }
      case "pending_orders": {
        const sb = supabaseServer();
        const { data } = await sb.from("orders")
          .select("invoice_no,customer_name,total,status,created_at")
          .not("status", "in", "(completed,delivered,cancelled,refunded)")
          .order("created_at", { ascending: false }).limit(15);
        const rows = (data as any[]) ?? [];
        if (rows.length === 0) return { ok: true, data: [], message: "No pending orders — you're all caught up 🎉" };
        const list = rows.slice(0, 8).map((o) => `${o.invoice_no ?? o.customer_name ?? "order"} (${formatPaise(o.total ?? 0)}, ${o.status})`).join("; ");
        return { ok: true, data: rows, message: `${rows.length} pending: ${list}.` };
      }
      case "find_customer": {
        const rows = await getCustomersDb({ q: String(args.query ?? "") });
        if (rows.length === 0) return { ok: true, message: `No customer matched "${args.query}".` };
        const c = rows[0];
        return { ok: true, data: rows, message: `${c.name}${c.phone ? ` · ${c.phone}` : ""} — ${c.type}${c.city ? ` · ${c.city}` : ""}${c.gstin ? ` · GST ${c.gstin}` : ""}.` };
      }
      case "add_stock_by_name":
      case "remove_stock_by_name": {
        const p = await resolveProductByName(String(args.query ?? ""));
        if (!p) return { ok: false, message: `I couldn't match "${args.query}" to a product. Try the SKU.` };
        const qty = Math.abs(Math.trunc(Number(args.qty) || 0));
        if (!qty) return { ok: false, message: "How many units?" };
        const delta = toolName === "add_stock_by_name" ? qty : -qty;
        const sb = supabaseServer();
        const newQty = Math.max(0, (p.qty ?? 0) + delta);
        await sb.from("products").update({ qty: newQty, last_movement_at: new Date().toISOString() }).eq("id", p.id);
        await sb.from("stock_adjustments").insert({ product_id: p.id, sku: p.sku, delta, kind: "adjustment", source: String(args.source ?? "DIVA command"), reason: "Adjusted by DIVA (by name)" });
        revalidatePath("/admin/inventory");
        return { ok: true, message: `${delta > 0 ? "Added" : "Removed"} ${qty} — ${p.name} (${p.sku}) is now ${newQty} in stock.` };
      }
      case "record_damage": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const qty = Math.abs(Math.trunc(Number(args.qty) || 0));
        if (!qty) return { ok: false, message: "How many pieces are damaged?" };
        const prod = sku ? await getProductBySku(sku) : await resolveProductByName(String(args.query ?? ""));
        if (!prod) return { ok: false, message: `I couldn't find ${sku || `"${args.query}"`}.` };
        const sb = supabaseServer();
        const newQty = Math.max(0, (prod.qty ?? 0) - qty);
        await sb.from("products").update({ qty: newQty, last_movement_at: new Date().toISOString() }).eq("id", prod.id);
        await sb.from("stock_adjustments").insert({ product_id: prod.id, sku: prod.sku, delta: -qty, source: "Damaged — removed", reason: String(args.reason ?? "").trim() || null, kind: "damage" });
        revalidatePath("/admin/inventory"); revalidatePath(`/admin/catalogue/${prod.sku}`);
        return { ok: true, message: `Marked ${qty} ${prod.name} (${prod.sku}) as damaged — stock is now ${newQty}.` };
      }
      case "create_product": {
        const name = String(args.name ?? "").trim();
        const categoryName = String(args.category ?? "").trim();
        const price = Number(args.price) || 0;
        const qty = Math.max(0, Math.trunc(Number(args.qty) || 0));
        if (!name || !categoryName || !(price > 0)) return { ok: false, message: "I need a name, category and a price above 0." };
        const sb = supabaseServer();
        let { data: cat } = await sb.from("categories").select("id,name").ilike("name", categoryName).maybeSingle();
        if (!cat) cat = await createCategoryJsonAction(categoryName) as any;
        if (!cat) return { ok: false, message: `Couldn't find or create the "${categoryName}" category.` };
        const res = await createProductAction({ categoryId: (cat as any).id, name, basePriceRupees: price, qty, type: "simple", colors: [] });
        if (!res.ok) return { ok: false, message: res.error ?? "Couldn't create the product." };
        revalidatePath("/admin/catalogue"); revalidatePath("/shop");
        return { ok: true, message: `Created ${name} (${res.sku}) in ${(cat as any).name} — wholesale ₹${price}, ${qty} pcs. It's saved as a draft; add a photo to publish.` };
      }
      case "rename_product": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const name = String(args.name ?? "").trim();
        if (!sku || !name) return { ok: false, message: "I need the SKU and the new name." };
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        await sb.from("products").update({ name }).eq("id", (p as any).id);
        revalidatePath("/admin/catalogue"); revalidatePath(`/admin/catalogue/${sku}`); revalidatePath("/shop");
        return { ok: true, message: `Renamed ${sku} from "${(p as any).name}" to "${name}".` };
      }
      case "set_category": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const categoryName = String(args.category ?? "").trim();
        if (!sku || !categoryName) return { ok: false, message: "I need the SKU and a category." };
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        let { data: cat } = await sb.from("categories").select("id,name").ilike("name", categoryName).maybeSingle();
        if (!cat) cat = await createCategoryJsonAction(categoryName) as any;
        if (!cat) return { ok: false, message: `Couldn't find or create the "${categoryName}" category.` };
        await sb.from("products").update({ category_id: (cat as any).id, subcategory_id: null }).eq("id", (p as any).id);
        revalidatePath("/admin/catalogue"); revalidatePath(`/admin/catalogue/${sku}`); revalidatePath("/shop");
        return { ok: true, message: `Moved ${sku} to ${(cat as any).name}.` };
      }
      case "set_stock": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const target = sku ? await getProductBySku(sku) : await resolveProductByName(String(args.query ?? ""));
        if (!target) return { ok: false, message: `I couldn't find ${sku || `"${args.query}"`}. Give me the SKU.` };
        const newQty = Math.max(0, Math.trunc(Number(args.qty)));
        if (!Number.isFinite(Number(args.qty))) return { ok: false, message: "What number should the stock be?" };
        const sb = supabaseServer();
        const { data: vrows } = await sb.from("variants").select("id,color,sku,qty").eq("product_id", target.id);
        const variants = (vrows as any[]) ?? [];
        if (variants.length) {
          const v = matchVariant(variants, String(args.color ?? args.query ?? ""));
          if (!v) return { ok: false, message: `Which colour? ${target.name} has: ${variants.map((x) => x.color).filter(Boolean).join(", ")}.` };
          const delta = newQty - (v.qty ?? 0);
          await sb.from("variants").update({ qty: newQty }).eq("id", v.id);
          const sum = variants.reduce((n, x) => n + (x.id === v.id ? newQty : (x.qty ?? 0)), 0);
          await sb.from("products").update({ qty: sum, last_movement_at: new Date().toISOString() }).eq("id", target.id);
          await sb.from("stock_adjustments").insert({ product_id: target.id, variant_id: v.id, sku: v.sku, delta, kind: "adjustment", source: "DIVA set stock", reason: `Set ${v.color} to exact count by DIVA` });
          revalidatePath("/admin/inventory");
          return { ok: true, message: `${target.name} ${v.color} set to ${newQty} (total ${sum}).` };
        }
        const delta = newQty - (target.qty ?? 0);
        await sb.from("products").update({ qty: newQty, last_movement_at: new Date().toISOString() }).eq("id", target.id);
        await sb.from("stock_adjustments").insert({ product_id: target.id, sku: target.sku, delta, kind: "adjustment", source: "DIVA set stock", reason: "Set to exact count by DIVA" });
        revalidatePath("/admin/inventory");
        return { ok: true, message: `${target.name} (${target.sku}) stock set to ${newQty}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}.` };
      }
      case "add_variant": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const color = String(args.color ?? "").trim(), size = String(args.size ?? "").trim(), polish = String(args.polish ?? "").trim();
        const qty = Math.max(0, Math.trunc(Number(args.qty) || 0));
        if (!sku || !(color || size || polish)) return { ok: false, message: "I need the product SKU and at least a colour, size or polish." };
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,type").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const label = [color, size, polish].filter(Boolean).join("-");
        const vsku = `${sku}-${label.replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase() || "VAR"}`;
        await sb.from("variants").insert({ product_id: (p as any).id, color: color || null, size: size || null, polish: polish || null, sku: vsku, qty });
        if ((p as any).type !== "configurable") await sb.from("products").update({ type: "configurable" }).eq("id", (p as any).id);
        revalidatePath(`/admin/catalogue/${sku}`); revalidatePath("/shop");
        return { ok: true, message: `Added variant ${[color, size, polish].filter(Boolean).join(" · ")} (${vsku}) to ${sku} with ${qty} pcs.` };
      }
      case "list_variants": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const { data: vs } = await sb.from("variants").select("color,size,polish,sku,qty").eq("product_id", (p as any).id);
        const rows = (vs as any[]) ?? [];
        if (!rows.length) return { ok: true, message: `${(p as any).name} (${sku}) has no variants — it's a simple product.` };
        const listv = rows.map((v) => `${[v.color, v.size, v.polish].filter(Boolean).join(" · ") || v.sku} — ${v.qty} pcs`).join("; ");
        return { ok: true, data: rows, message: `${(p as any).name} variants: ${listv}.` };
      }
      case "list_categories": {
        const sb = supabaseServer();
        const [{ data: cats }, { data: prods }] = await Promise.all([
          sb.from("categories").select("id,name"),
          sb.from("products").select("category_id"),
        ]);
        const counts = new Map<string, number>();
        for (const pr of (prods as any[]) ?? []) counts.set(pr.category_id, (counts.get(pr.category_id) ?? 0) + 1);
        const listc = ((cats as any[]) ?? []).map((c) => `${c.name} (${counts.get(c.id) ?? 0})`).join(", ");
        return { ok: true, data: cats, message: listc ? `Categories: ${listc}.` : "No categories yet." };
      }
      case "product_photos": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const target = sku ? await getProductBySku(sku) : await resolveProductByName(String(args.query ?? ""));
        if (!target) return { ok: false, message: `I couldn't find ${sku || `"${args.query}"`}.` };
        const sb = supabaseServer();
        const { data: imgs } = await sb.from("product_images").select("path,sort").eq("product_id", target.id).order("sort");
        const urls = ((imgs as any[]) ?? []).map((i) => i.path).filter((u) => typeof u === "string" && u.startsWith("http"));
        return { ok: true, data: urls, message: urls.length ? `${target.name} (${target.sku}) has ${urls.length} photo(s): ${urls.slice(0, 3).join(" , ")}${urls.length > 3 ? " …" : ""}` : `${target.name} (${target.sku}) has no photos yet — add one or ask me to generate it.` };
      }
      case "recent_sales": {
        const lim = Math.min(20, Math.max(1, Math.trunc(Number(args.limit) || 8)));
        const sb = supabaseServer();
        const { data } = await sb.from("orders").select("invoice_no,customer_name,total,bill_type,channel,created_at").order("created_at", { ascending: false }).limit(lim);
        const rows = (data as any[]) ?? [];
        if (!rows.length) return { ok: true, message: "No bills yet." };
        const lists = rows.map((o) => `${o.invoice_no ?? "—"} ${o.customer_name ?? "Walk-in"} ${formatPaise(o.total ?? 0)} (${o.bill_type ?? o.channel})`).join("; ");
        return { ok: true, data: rows, message: `Last ${rows.length} bills: ${lists}.` };
      }
      case "last_purchase": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const target = sku ? await getProductBySku(sku) : await resolveProductByName(String(args.query ?? ""));
        if (!target) return { ok: false, message: `I couldn't find ${sku || `"${args.query}"`}.` };
        const sb = supabaseServer();
        const { data } = await sb.from("purchase_items").select("unit_cost,qty, purchase:purchases(created_at,bill_no)").eq("mapped_product_id", target.id);
        const rows = ((data as any[]) ?? []).map((r) => ({ cost: r.unit_cost, qty: r.qty, at: r.purchase?.created_at ?? "", bill: r.purchase?.bill_no })).sort((a, b) => (a.at < b.at ? 1 : -1));
        if (!rows.length) return { ok: true, message: `No purchase recorded yet for ${target.name} (${target.sku}).` };
        const r0 = rows[0];
        return { ok: true, data: rows, message: `Last purchase of ${target.name} (${target.sku}): ${formatPaise(r0.cost)} each, ${r0.qty} pcs${r0.bill ? ` on bill ${r0.bill}` : ""} (${r0.at ? new Date(r0.at).toLocaleDateString("en-IN") : "—"}).` };
      }
      case "set_price": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const price = Number(args.price) || 0;
        const tier = String(args.tier ?? "base").toLowerCase();
        if (!sku || !(price > 0)) return { ok: false, message: "I need a SKU and a price above 0." };
        const sb = supabaseServer();
        const { data: p } = await sb.from("products").select("id,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const paise = Math.round(price * 100);
        // Explicit tier → pin that exact price as an override (Phase 4).
        if (tier === "retail" || tier === "mrp" || tier === "wholesale") {
          const col = tier === "retail" ? "retail_override" : tier === "mrp" ? "mrp_override" : "wholesale_override";
          const { error } = await sb.from("products").update({ [col]: paise }).eq("id", (p as any).id);
          if (error) return { ok: false, message: `${error.message} (the price-override columns need migration 0003 applied).` };
          revalidatePath("/admin/catalogue"); revalidatePath(`/admin/catalogue/${sku}`); revalidatePath("/shop"); revalidatePath("/trade");
          return { ok: true, message: `Set ${(p as any).name} (${sku}) ${tier} price to ${formatPaise(paise)}.` };
        }
        // No tier → set the base wholesale cost and re-derive retail/MRP from the formula.
        const formula = await getPricingFormula();
        const prices = computePrices(paise, formula);
        if (!isValidPriceSet(prices)) return { ok: false, message: "That base price produces an invalid price set." };
        await sb.from("products").update({ base_wholesale: paise }).eq("id", (p as any).id);
        revalidatePath("/admin/catalogue"); revalidatePath(`/admin/catalogue/${sku}`); revalidatePath("/shop"); revalidatePath("/trade");
        return { ok: true, message: `Set ${(p as any).name} (${sku}) base/wholesale to ${formatPaise(paise)}. Retail ${formatPaise(prices.retailPrice)} · MRP ${formatPaise(prices.mrp)}.` };
      }
      case "rename_sku": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const newSku = String(args.newSku ?? "").trim().toUpperCase().replace(/\s+/g, "");
        if (!sku || !newSku) return { ok: false, message: "I need the current SKU and the new SKU." };
        if (sku === newSku) return { ok: false, message: "Those SKUs are the same." };
        const sb = supabaseServer();
        const { data: dup } = await sb.from("products").select("id").eq("sku", newSku).maybeSingle();
        if (dup) return { ok: false, message: `SKU ${newSku} already exists — pick another.` };
        const { data: p } = await sb.from("products").select("id,name").eq("sku", sku).maybeSingle();
        if (!p) return { ok: false, message: `No product with SKU ${sku}.` };
        const { error } = await sb.from("products").update({ sku: newSku }).eq("id", (p as any).id);
        if (error) return { ok: false, message: error.message };
        revalidatePath("/admin/catalogue"); revalidatePath("/shop");
        return { ok: true, message: `Renamed ${sku} → ${newSku} for ${(p as any).name}.` };
      }
      case "create_customer":
      case "set_customer_type": {
        const name = String(args.name ?? "").trim();
        if (!name) return { ok: false, message: "Which customer?" };
        const type = String(args.type ?? "retail") === "wholesale" ? "wholesale" : "retail";
        const sb = supabaseServer();
        const { data: existing } = await sb.from("customers").select("id,name,type").ilike("name", name).maybeSingle();
        if (existing) {
          await sb.from("customers").update({ type }).eq("id", (existing as any).id);
          revalidatePath("/admin/customers");
          return { ok: true, message: `${(existing as any).name} is now a ${type} customer${type === "wholesale" ? " — they'll see wholesale prices." : "."}` };
        }
        const phone = String(args.phone ?? "").trim() || null;
        const { error } = await sb.from("customers").insert({ name, type, phone });
        if (error) return { ok: false, message: error.message };
        revalidatePath("/admin/customers");
        return { ok: true, message: `Added ${name} as a ${type} customer.` };
      }
      case "create_category": {
        const name = String(args.name ?? "").trim();
        if (!name) return { ok: false, message: "What should the category be called?" };
        const cat = await createCategoryJsonAction(name);
        if (!cat) return { ok: false, message: `Couldn't create "${name}" (it may already exist).` };
        return { ok: true, message: `Created the "${cat.name}" category.` };
      }
      case "rename_category": {
        const from = String(args.from ?? args.name ?? "").trim();
        const to = String(args.to ?? args.newName ?? "").trim();
        if (!from || !to) return { ok: false, message: "Tell me the category to rename and the new name." };
        const sb = supabaseServer();
        const { data: cat } = await sb.from("categories").select("id,name").ilike("name", from).maybeSingle();
        if (!cat) return { ok: false, message: `No category named "${from}". Check the exact category name (try "kitni categories hain?").` };
        const { data: clash } = await sb.from("categories").select("id").ilike("name", to).neq("id", (cat as any).id).maybeSingle();
        if (clash) return { ok: false, message: `A category called "${to}" already exists.` };
        await sb.from("categories").update({ name: to, slug: slugify(to) }).eq("id", (cat as any).id);
        revalidatePath("/admin/categories"); revalidatePath("/shop"); revalidatePath("/catalog");
        return { ok: true, message: `Renamed category "${(cat as any).name}" → "${to}".` };
      }
      case "create_subcategory": {
        const name = String(args.name ?? "").trim();
        if (!name) return { ok: false, message: "What should the subcategory be called?" };
        const parent = String(args.parent ?? "").trim();
        const sb = supabaseServer();
        let parentId: string | null = null;
        if (parent) {
          const { data: pc } = await sb.from("categories").select("id").ilike("name", parent).maybeSingle();
          parentId = (pc as any)?.id ?? null;
        }
        const slug = slugify(name);
        const { error } = await sb.from("subcategories").insert({ name, slug, category_id: parentId });
        if (error) return { ok: false, message: `Couldn't create the subcategory (${error.message}). The subcategory table may need migration 0002 applied.` };
        revalidatePath("/admin/categories");
        return { ok: true, message: `Created subcategory "${name}"${parent ? ` under ${parent}` : ""}.` };
      }
      case "share_catalog": {
        const facet = String(args.facet ?? "").trim();
        const sb = supabaseServer();
        const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
        let path = "/catalog";
        let scope = "the full catalogue";
        if (facet) {
          const slug = slugify(facet);
          // Try a parent category first, then a subcategory, then a keyword search.
          const { data: cat } = await sb.from("categories").select("slug,name").or(`slug.eq.${slug},name.ilike.%${facet}%`).maybeSingle();
          if (cat) {
            path = `/catalog?category=${(cat as any).slug}`;
            scope = `the ${(cat as any).name} catalogue`;
          } else {
            const { data: sub } = await sb.from("subcategories").select("slug,name,category:categories(slug)").or(`slug.eq.${slug},name.ilike.%${facet}%`).maybeSingle();
            if (sub) {
              path = `/catalog?category=${(sub as any).category?.slug ?? "all"}&subcategory=${(sub as any).slug}`;
              scope = `the ${(sub as any).name} catalogue`;
            } else {
              path = `/catalog?q=${encodeURIComponent(facet)}`;
              scope = `"${facet}"`;
            }
          }
        }
        const link = `${siteBase}${path}`;
        const wa = Number(args.whatsapp) ? ` Send on WhatsApp: https://wa.me/?text=${encodeURIComponent(`Check out ${scope} from Aggarwal Jewellers: ${link}`)}` : "";
        return { ok: true, data: { link }, message: `Here's a shareable link for ${scope}: ${link}${wa}` };
      }
      case "convert_invoice": {
        const invoice = String(args.invoice ?? "").trim();
        if (!invoice) return { ok: true, message: "Open billing and pick the cash memo you want to upgrade to GST.", navigate: PAGE_MAP["billing"] };
        const sb = supabaseServer();
        const { data: o } = await sb.from("orders").select("id,invoice_no,bill_type,customer_phone").eq("invoice_no", invoice).maybeSingle();
        if (!o) return { ok: false, message: `I couldn't find invoice ${invoice}.` };
        if ((o as any).bill_type === "gst") return { ok: true, message: `Invoice ${invoice} is already a GST invoice.` };
        // Validation: a GST invoice should carry the buyer's GSTIN.
        let warn = "";
        const phone = (o as any).customer_phone;
        if (phone) {
          const { data: cust } = await sb.from("customers").select("gstin").eq("phone", phone).maybeSingle();
          if (!cust || !(cust as any).gstin) warn = " Note: this customer has no GSTIN on file — add one for a compliant tax invoice.";
        }
        const { error } = await sb.from("orders").update({ bill_type: "gst" }).eq("id", (o as any).id);
        if (error) return { ok: false, message: error.message };
        revalidatePath("/admin/sales"); revalidatePath(`/admin/invoice/${(o as any).id}`);
        return { ok: true, message: `Converted cash memo ${invoice} into a GST invoice.${warn}` };
      }

      // ---- Accounting & business health (AI employee upgrade) -----------------
      case "check_cash_bank": {
        const sb = supabaseServer();
        const { data: sum, error } = await sb.rpc("cash_bank_summary");
        if (error) return { ok: false, message: `Cash book isn't ready (${error.message}).` };
        const r: any = (Array.isArray(sum) ? sum[0] : sum) ?? {};
        const cash = Number(r.opening_cash ?? 0) + Number(r.cash_in ?? 0) - Number(r.cash_out ?? 0);
        const bank = Number(r.opening_bank ?? 0) + Number(r.bank_in ?? 0) - Number(r.bank_out ?? 0);
        return { ok: true, data: r, message: `Cash in hand ${formatPaise(cash)} · Bank/UPI ${formatPaise(bank)}. (In: ${formatPaise(Number(r.cash_in ?? 0))} cash / ${formatPaise(Number(r.bank_in ?? 0))} bank · Out to suppliers: ${formatPaise(Number(r.cash_out ?? 0) + Number(r.bank_out ?? 0))}.)` };
      }
      case "receivables": {
        const sb = supabaseServer();
        const party = String(args.party ?? "").trim().toLowerCase();
        const { data } = await sb.from("orders").select("customer_name,total,amount_paid,bill_type,gst_mode,return_amount,invoice_no,created_at,status").order("created_at", { ascending: false }).limit(1000);
        const due = new Map<string, number>();
        const billCount = new Map<string, number>();
        let total = 0;
        for (const o of (data as any[]) ?? []) {
          if (isDeadOrder(o.status)) continue;
          // GST-aware due — same formula as the invoice's "Balance due" (lib/business).
          const d = orderDuePaise(o);
          if (!d) continue;
          const who = o.customer_name || "Walk-in / unnamed";
          if (party && !who.toLowerCase().includes(party)) continue;
          total += d;
          due.set(who, (due.get(who) ?? 0) + d);
          billCount.set(who, (billCount.get(who) ?? 0) + 1);
        }
        if (party) {
          if (!total) return { ok: true, message: `"${args.party}" ka kuch baaki nahi — all settled ✓` };
          const [n, v] = [...due.entries()][0];
          return { ok: true, data: { party: n, outstanding: v }, message: `${n} owes ${formatPaise(v)} across ${billCount.get(n) ?? 0} open bill(s). Say "${n} ne <amount> diye" when they pay.` };
        }
        if (!total) return { ok: true, message: "Nobody owes us anything right now — sab paisa aa chuka hai 🎉" };
        const top = [...due.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([n, v]) => `${n}: ${formatPaise(v)}`).join(" · ");
        return { ok: true, data: { total, parties: due.size }, message: `Outstanding ${formatPaise(total)} from ${due.size} parties. Biggest: ${top}.` };
      }
      case "record_party_payment": {
        const q = String(args.party ?? "").trim();
        const amount = Math.round((Number(args.amount) || 0) * 100); // ₹ → paise
        if (!q || amount <= 0) return { ok: false, message: `Whose payment, and how much? e.g. "Sharma ne 5000 diye".` };
        const rows = await getCustomersDb({ q });
        if (rows.length === 0) return { ok: false, message: `I couldn't find a party named "${q}". Check the name on the Customers page first.` };
        const c: any = rows[0];
        const mode = ["cash", "upi", "bank"].includes(String(args.mode)) ? String(args.mode) : "cash";
        const sb = supabaseServer();
        const { data, error } = await sb.rpc("record_party_payment", { p_customer: c.id, p_amount: amount, p_mode: mode, p_note: "via DIVA" });
        if (error) return { ok: false, message: `Couldn't record it (${error.message}). Has migration 0043_party_ledger been applied?` };
        const r: any = data ?? {};
        revalidatePath("/admin/creditors"); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard"); revalidatePath("/admin/cashbook"); revalidatePath(`/admin/customer/${c.id}`);
        const adv = Number(r.unallocated ?? 0);
        return { ok: true, data: r, message: `Received ${formatPaise(amount)} from ${c.name} (${mode}) — settled against ${Number(r.bills ?? 0)} bill(s)${adv > 0 ? `; ${formatPaise(adv)} kept on account as advance` : ""}. ✓` };
      }
      case "payables": {
        const sb = supabaseServer();
        const [{ data: purch }, { data: pays }, { data: sups }] = await Promise.all([
          sb.from("purchases").select("supplier_id,total,return_amount").limit(2000),
          sb.from("supplier_payments").select("supplier_id,amount").limit(2000),
          sb.from("suppliers").select("id,name").limit(500),
        ]);
        const name = new Map(((sups as any[]) ?? []).map((x) => [x.id, x.name]));
        const owed = new Map<string, number>();
        for (const p of (purch as any[]) ?? []) owed.set(p.supplier_id ?? "?", (owed.get(p.supplier_id ?? "?") ?? 0) + Number(p.total ?? 0) - Number(p.return_amount ?? 0));
        for (const p of (pays as any[]) ?? []) owed.set(p.supplier_id ?? "?", (owed.get(p.supplier_id ?? "?") ?? 0) - Number(p.amount ?? 0));
        const rows = [...owed.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const total = rows.reduce((s2, [, v]) => s2 + v, 0);
        if (!total) return { ok: true, message: "No pending supplier payments — sab clear hai ✓" };
        const top = rows.slice(0, 6).map(([id, v]) => `${name.get(id) ?? "Unknown"}: ${formatPaise(v)}`).join(" · ");
        return { ok: true, data: { total }, message: `We owe suppliers ${formatPaise(total)}. ${top}.` };
      }
      case "business_health": {
        const sb = supabaseServer();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = await getDashboardData(today.toISOString(), new Date().toISOString());
        let health = "";
        try {
          const { data: h } = await sb.from("v_accounting_health").select("*").maybeSingle();
          if (h) health = ` Receivable ${formatPaise(Number((h as any).receivable_paise ?? 0))} · payable ${formatPaise(Number((h as any).payable_paise ?? 0))}${Number((h as any).negative_stock ?? 0) ? ` · ⚠ ${(h as any).negative_stock} negative-stock items` : ""}.`;
        } catch { /* view optional */ }
        return { ok: true, data: d, message: `Today: ${formatPaise(d.revenue)} from ${d.orders} bills (${d.pos} counter, ${d.cod} COD). Stock: ${d.low} low, ${d.dead} dead.${health} ${d.low ? "Suggestion: reorder the low-stock items." : "All healthy ✓"}` };
      }
      case "inactive_customers": {
        const days = Math.max(7, Number(args.days) || 60);
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const sb = supabaseServer();
        const { data: cust } = await sb.from("customers").select("id,name,phone").limit(1000);
        const { data: ords } = await sb.from("orders").select("customer_id,created_at").not("customer_id", "is", null).order("created_at", { ascending: false }).limit(3000);
        const last = new Map<string, string>();
        for (const o of (ords as any[]) ?? []) if (!last.has(o.customer_id)) last.set(o.customer_id, o.created_at);
        const inactive = ((cust as any[]) ?? []).filter((c) => { const l = last.get(c.id); return l && l < cutoff; });
        if (!inactive.length) return { ok: true, message: `No customers have gone quiet in the last ${days} days.` };
        const list = inactive.slice(0, 10).map((c) => c.name || c.phone || "?").join(", ");
        return { ok: true, data: inactive.slice(0, 50), message: `${inactive.length} customers haven't purchased in ${days}+ days: ${list}${inactive.length > 10 ? "…" : ""}. Want me to prepare a WhatsApp catalogue link to win them back?` };
      }
      case "top_wholesale": {
        const sb = supabaseServer();
        const { data } = await sb.from("orders").select("customer_name,total").eq("channel", "wholesale").limit(2000);
        const by = new Map<string, number>();
        for (const o of (data as any[]) ?? []) by.set(o.customer_name ?? "?", (by.get(o.customer_name ?? "?") ?? 0) + Number(o.total ?? 0));
        const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!rows.length) return { ok: true, message: "No wholesale orders yet." };
        return { ok: true, data: rows, message: `Top wholesale parties: ${rows.map(([n, v], i) => `${i + 1}. ${n} (${formatPaise(v)})`).join(" · ")}.` };
      }
      case "hide_dead_stock": {
        const rows = await getInventoryClassified();
        const dead = rows.filter((r: any) => r.cls === "dead" && r.sku);
        if (!dead.length) return { ok: true, message: "No dead stock to hide — everything is moving 🎉" };
        const sb = supabaseServer();
        const { error } = await sb.from("products").update({ status: "draft" }).in("sku", dead.map((r: any) => r.sku));
        if (error) return { ok: false, message: error.message };
        revalidatePath("/shop"); revalidatePath("/admin/catalogue"); revalidatePath("/admin/inventory");
        return { ok: true, data: { hidden: dead.length }, message: `Hidden ${dead.length} dead-stock products from the storefront (set to draft): ${dead.slice(0, 8).map((r: any) => r.sku).join(", ")}${dead.length > 8 ? "…" : ""}. Say "show <SKU>" to bring any back.` };
      }
      case "remember_note": {
        const note = String(args.note ?? "").trim().slice(0, 300);
        if (!note) return { ok: false, message: "Tell me what to remember." };
        const sb = supabaseServer();
        const { error } = await sb.from("diva_memory").insert({ note });
        if (error) return { ok: false, message: `I couldn't save that (${error.message}). Apply migration 0042_diva_memory.sql.` };
        return { ok: true, message: `Remembered: "${note}". I'll respect this in future plans.` };
      }

      // ---- Product factory: ad photos + one-command publish --------------------
      case "generate_ad_images": {
        const sku = String(args.sku ?? "").trim().toUpperCase();
        const limit = Math.min(8, Math.max(1, Number(args.limit) || 5));
        const sb = supabaseServer();
        let targets: { sku: string }[] = [];
        if (sku) {
          targets = [{ sku }];
        } else {
          const { data: prods } = await sb.from("products").select("id,sku").order("created_at", { ascending: false }).limit(80);
          const ids = ((prods as any[]) ?? []).map((p) => p.id);
          const { data: imgs } = ids.length
            ? await sb.from("product_images").select("product_id").eq("kind", "model").in("product_id", ids)
            : ({ data: [] } as any);
          const have = new Set(((imgs as any[]) ?? []).map((i: any) => i.product_id));
          targets = ((prods as any[]) ?? []).filter((p) => !have.has(p.id)).slice(0, limit).map((p) => ({ sku: p.sku }));
        }
        if (!targets.length) return { ok: true, message: "Every product already has a photo 🎉" };
        const done: string[] = []; const failed: string[] = [];
        for (const t of targets) {
          const r = await generateAdImageAction(t.sku);
          if (r.ok) done.push(t.sku); else failed.push(`${t.sku} (${r.reason ?? "error"})`);
        }
        revalidatePath("/admin/catalogue"); revalidatePath("/admin/media"); revalidatePath("/shop");
        const more = !sku && done.length + failed.length >= limit ? ` There may be more — say "photos banao" again for the next batch.` : "";
        return {
          ok: failed.length === 0,
          data: { done, failed },
          message: `${done.length ? `Ready-to-advertise photos created for ${done.length} products: ${done.join(", ")}. ` : ""}${failed.length ? `Couldn't do: ${failed.join(", ")}.` : ""}${more} Say "sab publish kar do" to put them live.`.trim(),
        };
      }
      case "publish_products": {
        const scope = String(args.scope ?? "photos");
        const sb = supabaseServer();
        const { data: drafts } = await sb.from("products").select("id,sku,name").eq("status", "draft").limit(200);
        let list = (drafts as any[]) ?? [];
        if (!list.length) return { ok: true, message: "No drafts — everything is already live on the store." };
        if (scope !== "all") {
          const { data: imgs } = await sb.from("product_images").select("product_id").eq("kind", "model").in("product_id", list.map((p) => p.id));
          const have = new Set(((imgs as any[]) ?? []).map((i: any) => i.product_id));
          const withPhoto = list.filter((p) => have.has(p.id));
          if (!withPhoto.length) return { ok: false, message: `${list.length} drafts are waiting but none has a photo yet — say "photos banao" first, then publish.` };
          list = withPhoto;
        }
        const { error } = await sb.from("products").update({ status: "published" }).in("id", list.map((p) => p.id));
        if (error) return { ok: false, message: error.message };
        revalidatePath("/shop"); revalidatePath("/admin/catalogue");
        return { ok: true, data: { published: list.length }, message: `Published ${list.length} products — live on the website now ✓ ${list.slice(0, 10).map((p) => p.sku).join(", ")}${list.length > 10 ? "…" : ""}` };
      }

      default:
        return { ok: false, message: "That action isn't wired yet." };
    }
  } catch (e) {
    return { ok: false, message: `Something went wrong: ${e instanceof Error ? e.message : "unknown error"}.` };
  }
  })();
  // AI task history — every action DIVA takes is recorded (agent_runs; never blocks the action).
  try {
    await supabaseServer().from("agent_runs").insert({
      agent: "diva",
      trigger: toolName,
      input: args as any,
      output: { ok: __res.ok, message: __res.message } as any,
      needs_human: !!tool.confirm,
    });
  } catch { /* logging is best-effort */ }
  return __res;
}

/** Best-effort: match a product by SKU embedded in the text, else by name/keyword search. */
// Hindi/Hinglish/English filler words that carry no product meaning.
const NAME_STOP = new Set([
  "wala", "wali", "wale", "ka", "ki", "ke", "ko", "me", "mein", "ka", "hai", "kar", "karo", "kardo",
  "do", "de", "dena", "the", "a", "an", "of", "for", "and", "set", "piece", "pieces", "pcs", "pc",
  "stock", "add", "kam", "jyada", "zyada", "badha", "ghata", "please", "show", "dikhao", "ka", "wala",
]);

/** Pick the colour variant a command refers to, by colour name or variant SKU. A single-variant
 *  product defaults to its only variant. Returns null when there are several and none matched,
 *  so DIVA asks "which colour?" rather than guessing. */
function matchVariant(variants: any[], hint: string): any | null {
  if (!variants?.length) return null;
  const h = (hint ?? "").trim().toLowerCase();
  if (!h) return variants.length === 1 ? variants[0] : null;
  let v = variants.find((x) => String(x.sku ?? "").toLowerCase() === h);
  if (v) return v;
  const words = h.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  v = variants.find((x) => {
    const c = String(x.color ?? "").toLowerCase();
    return !!c && (h.includes(c) || words.some((w) => c.includes(w) || w.includes(c)));
  });
  return v ?? (variants.length === 1 ? variants[0] : null);
}

/**
 * Resolve a product from a fuzzy name phrase (e.g. "meenakari wala haar" → Meenakari
 * Peacock Haar). Token-overlap scored against name + category + tags, so word order,
 * filler words and partial names all still match. Returns null only when nothing shares
 * a meaningful word, so DIVA honestly asks for the SKU instead of guessing.
 */
async function resolveProductByName(query: string): Promise<{ id: string; sku: string; name: string; qty: number; base_wholesale: number } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !NAME_STOP.has(t));

  const sb = supabaseServer();
  const { data } = await sb.from("products").select("id,sku,name,qty,base_wholesale,generated_content,category:categories(name)").limit(2000);
  const rows = (data as any[]) ?? [];
  if (!rows.length) return null;

  // 1) ANY token that LOOKS like a SKU (has a digit) must match a real SKU EXACTLY — product
  //    or variant. If it looks like a SKU but matches nothing, return null so DIVA says
  //    "no product with that code" instead of fuzzy-guessing a WRONG product (the WBR113→WBR1002 bug).
  const skuLike = tokens.filter((t) => /\d/.test(t));
  if (skuLike.length) {
    for (const t of skuLike) {
      const hit = rows.find((r) => String(r.sku).toLowerCase() === t);
      if (hit) return pick(hit);
      const { data: v } = await sb.from("variants").select("product_id").ilike("sku", t).maybeSingle();
      if (v) { const parent = rows.find((r) => r.id === (v as any).product_id); if (parent) return pick(parent); }
    }
    return null; // a code was given but no exact match — never substitute a different product
  }

  if (tokens.length === 0) {
    const lower = q.toLowerCase();
    const hit = rows.find((r) => String(r.name).toLowerCase() === lower);
    return hit ? pick(hit) : null;
  }

  // 2) Descriptive name match — WHOLE-WORD only (so "wbr" can't match inside "WBR1002").
  //    Requires a clear winner; ambiguous/weak → null so DIVA asks for the SKU.
  let best: any = null, bestScore = 0, secondScore = 0;
  for (const r of rows) {
    const tags = (((r.generated_content as any)?.tags) ?? []) as string[];
    const hay = ` ${`${r.name} ${r.category?.name ?? ""} ${tags.join(" ")}`.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    let score = 0;
    for (const t of tokens) if (hay.includes(` ${t} `)) score++;
    if (score > bestScore) { secondScore = bestScore; bestScore = score; best = r; }
    else if (score > secondScore) { secondScore = score; }
  }
  // Need a meaningful, unambiguous match: at least one shared word and a clear lead over runner-up.
  return bestScore >= 1 && bestScore > secondScore ? pick(best) : null;

  function pick(r: any) { return { id: r.id, sku: r.sku, name: r.name, qty: r.qty, base_wholesale: r.base_wholesale }; }
}
