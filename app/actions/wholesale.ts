"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { getWholesaleSession, getWholesaleIdentity } from "@/lib/wholesale";

const COOKIE = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/", maxAge: 60 * 60 * 12 };

function genCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** Wholesale customer logs in with phone + access code (must be approved). */
export async function wholesaleLoginAction(formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!phone || !code) redirect("/trade/login?error=1");
  const { data } = await supabaseServer()
    .from("customers").select("id")
    .eq("type", "wholesale").eq("wholesale_approved", true).eq("phone", phone).eq("login_code", code)
    .maybeSingle();
  if (!data) redirect("/trade/login?error=1");
  cookies().set("bd_wholesale", (data as any).id, COOKIE);
  redirect("/trade");
}

export async function wholesaleLogoutAction() {
  cookies().set("bd_wholesale", "", { httpOnly: true, path: "/", maxAge: 0 });
  redirect("/trade/login");
}

/** Owner: approve/revoke wholesale access and (re)issue an access code. */
export async function approveWholesaleAction(formData: FormData) {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const approve = String(formData.get("approve") ?? "") === "1";
  if (!id) return;
  const sb = supabaseServer();
  if (approve) {
    const { data: cur } = await sb.from("customers").select("login_code").eq("id", id).maybeSingle();
    const code = (cur as any)?.login_code || genCode();
    await sb.from("customers").update({ wholesale_approved: true, type: "wholesale", login_code: code }).eq("id", id);
  } else {
    await sb.from("customers").update({ wholesale_approved: false }).eq("id", id);
  }
  revalidatePath(`/admin/customer/${id}`); revalidatePath("/admin/customers");
}

export async function regenWholesaleCodeAction(formData: FormData) {
  if (!(await requirePerm("customers.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseServer().from("customers").update({ login_code: genCode() }).eq("id", id);
  revalidatePath(`/admin/customer/${id}`);
}

/** Place a wholesale order. Prices are recomputed server-side at the wholesale rate. */
export async function placeWholesaleOrderAction(items: { sku: string; qty: number }[]): Promise<{ ok: boolean; orderId?: string; total?: number; error?: string }> {
  const sess = await getWholesaleSession();
  if (!sess) return { ok: false, error: "Please log in as an approved wholesale customer." };
  const clean = (items ?? []).filter((i) => i.sku && i.qty > 0).map((i) => ({ sku: i.sku, qty: Math.floor(i.qty) }));
  if (!clean.length) return { ok: false, error: "Enter quantities for at least one product." };
  const sb = supabaseServer();
  const { data, error } = await sb.rpc("place_wholesale_order", { p_customer: sess.id, p_items: clean, p_allow_oversell: false });
  if (error) return { ok: false, error: error.message };
  const orderId = (data as any)?.order_id;
  let total = (data as any)?.total as number;
  total = await applyWholesaleTiers(sb, orderId, total);
  revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
  return { ok: true, orderId, total };
}

/**
 * Quantity-break tiers (0048): per-line % off by that line's qty (largest tier wins), applied on
 * unit_price with unit_mrp keeping the list rate. Adjusts orders.total so every downstream figure
 * stays consistent. Best-effort — the bill stands at list rates if anything hiccups. Returns the
 * (possibly reduced) order total. NOTE: no ledger entry here — the sale is booked at payment
 * confirmation (0060); the GST invoice number is assigned then too.
 */
async function applyWholesaleTiers(sb: ReturnType<typeof supabaseServer>, orderId: string | undefined, total: number): Promise<number> {
  if (!orderId) return total;
  try {
    const { data: ps } = await sb.from("pricing_settings").select("wholesale_tiers").limit(1).maybeSingle();
    const tiers = (Array.isArray((ps as any)?.wholesale_tiers) ? (ps as any).wholesale_tiers : []) as { min_qty: number; pct_off: number }[];
    if (!tiers.length) return total;
    const { data: lines } = await sb.from("order_items").select("id,qty,unit_price,unit_mrp").eq("order_id", orderId);
    let discTotal = 0;
    for (const l of (lines as any[]) ?? []) {
      const tier = tiers.filter((t) => l.qty >= Number(t.min_qty) && Number(t.pct_off) > 0)
        .sort((a, b) => Number(b.min_qty) - Number(a.min_qty))[0];
      const pct = tier ? Math.min(50, Math.max(0, Number(tier.pct_off))) : 0;
      if (!pct) continue;
      const newUnit = Math.round((l.unit_price * (100 - pct)) / 100);
      const disc = (l.unit_price - newUnit) * l.qty;
      if (disc <= 0) continue;
      await sb.from("order_items").update({ unit_mrp: Math.max(l.unit_mrp ?? 0, l.unit_price), unit_price: newUnit, line_total: newUnit * l.qty }).eq("id", l.id);
      discTotal += disc;
    }
    if (discTotal > 0) {
      await sb.from("orders").update({ total: Math.max(0, total - discTotal), tier_discount: discTotal }).eq("id", orderId);
      return Math.max(0, total - discTotal);
    }
  } catch { /* tiers are best-effort */ }
  return total;
}

/**
 * GUEST wholesale checkout (open portal): a buyer browses without logging in, then places an order
 * by giving their phone + name (+ optional GSTIN / address). We find-or-create the wholesale
 * customer by phone, save any billing not already on file, remember them via the bd_wholesale
 * cookie, and place the order. The ₹-minimum is still enforced by place_wholesale_order. No passcode
 * and no prior approval are required — the minimum-order value is the gate.
 */
export async function placeWholesaleGuestOrderAction(
  items: { sku: string; qty: number }[],
  billing: { phone: string; name: string; gstin?: string; address?: string },
): Promise<{ ok: boolean; orderId?: string; total?: number; error?: string }> {
  const phone = (billing?.phone ?? "").replace(/\D/g, "").slice(-10);
  const name = (billing?.name ?? "").trim();
  if (phone.length !== 10) return { ok: false, error: "Please enter a valid 10-digit phone number." };
  if (!name) return { ok: false, error: "Please enter your name or shop name." };
  const clean = (items ?? []).filter((i) => i.sku && i.qty > 0).map((i) => ({ sku: i.sku, qty: Math.floor(i.qty) }));
  if (!clean.length) return { ok: false, error: "Enter quantities for at least one product." };

  const sb = supabaseServer();
  const gstin = (billing?.gstin ?? "").trim().toUpperCase() || null;
  const address = (billing?.address ?? "").trim() || null;

  // Find-or-create the wholesale customer by phone; fill in any billing not already saved.
  let customerId: string;
  const { data: existing } = await sb.from("customers").select("id,name,gstin,address,type").eq("phone", phone).maybeSingle();
  if (existing) {
    customerId = (existing as any).id;
    const patch: Record<string, unknown> = { type: "wholesale" };
    if (!(existing as any).name && name) patch.name = name;
    if (!(existing as any).gstin && gstin) patch.gstin = gstin;
    if (!(existing as any).address && address) patch.address = address;
    await sb.from("customers").update(patch).eq("id", customerId);
  } else {
    const { data: created, error: cErr } = await sb.from("customers")
      .insert({ name, phone, type: "wholesale", gstin, address }).select("id").maybeSingle();
    if (cErr || !created) return { ok: false, error: "Couldn't save your details — please try again." };
    customerId = (created as any).id;
  }

  // Remember this buyer on this device so the billing form prefills next time.
  cookies().set("bd_wholesale", customerId, COOKIE);

  const { data, error } = await sb.rpc("place_wholesale_order", { p_customer: customerId, p_items: clean, p_allow_oversell: false });
  if (error) return { ok: false, error: error.message };
  const orderId = (data as any)?.order_id;
  let total = (data as any)?.total as number;
  total = await applyWholesaleTiers(sb, orderId, total);
  revalidatePath("/admin/orders"); revalidatePath("/admin/sales"); revalidatePath("/admin/dashboard");
  return { ok: true, orderId, total };
}

/**
 * Dealer confirms they've paid via the UPI QR and (optionally) types their UPI reference / txn id.
 * This does NOT mark the order paid — it only records the dealer's claim so the owner can match it
 * against the bank credit before confirming. Guarded to the dealer's OWN order via the trade session.
 */
export async function submitWholesalePaymentRefAction(orderId: string, ref: string): Promise<{ ok: boolean; error?: string }> {
  // Works for both an approved dealer session and a guest recognised by cookie (open portal).
  const who = (await getWholesaleSession()) ?? (await getWholesaleIdentity());
  if (!who) return { ok: false, error: "We couldn't find your order — please contact us on WhatsApp." };
  const cleanRef = (ref ?? "").trim().slice(0, 40) || "(marked paid — no reference given)";
  if (!orderId) return { ok: false, error: "Missing order." };
  const sb = supabaseServer();
  // Ownership check — a buyer may only touch their own order.
  const { data: o } = await sb.from("orders").select("id,customer_id,payment_confirmed_at").eq("id", orderId).maybeSingle();
  if (!o || (o as any).customer_id !== who.id) return { ok: false, error: "That order isn't on your account." };
  if ((o as any).payment_confirmed_at) return { ok: true }; // owner already confirmed — nothing to do
  const { error } = await sb.from("orders").update({ payment_ref: cleanRef }).eq("id", orderId);
  if (error) return { ok: false, error: "Couldn't save your reference — please tell us on WhatsApp." };
  await sb.from("audit_log").insert({ actor: "dealer", action: "wholesale_payment_claimed", ref: orderId, detail: `Dealer marked order ${String(orderId).slice(0, 8).toUpperCase()} paid · ref ${cleanRef}.` }).then(() => {}, () => {});
  revalidatePath("/admin/orders");
  return { ok: true };
}
