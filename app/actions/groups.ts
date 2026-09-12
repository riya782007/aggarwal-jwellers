"use server";
/**
 * Box / group QR — a convenience aggregation over individually-tracked units.
 * A box is ONE QR that resolves to a piece SKU + a pack count. Scanning it at the POS adds N
 * individual units to the bill. Stock lives on the piece (product/variant qty); the box holds none,
 * so its availability is always derived from the piece's live stock. Homogeneous boxes only.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { getPricingFormula } from "@/lib/supabase/queries";
import { resolvePrices, overridesOf } from "@/lib/pricing";
import { logActivity } from "@/lib/audit";
import { parseGroupScan } from "@/lib/groupQr";
import { escapeIlikeExact } from "@/lib/scan";

type PieceRow = { sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; category: string };

async function lookupPieceBySku(sku: string): Promise<PieceRow | null> {
  const sb = supabaseServer();
  const formula = await getPricingFormula();
  const exact = escapeIlikeExact(sku);
  const { data: prod } = await sb.from("products")
    .select("sku,name,base_wholesale,qty,wholesale_override,retail_override,mrp_override")
    .ilike("sku", exact).limit(1).maybeSingle();
  if (prod) {
    const ps = resolvePrices((prod as any).base_wholesale, formula, overridesOf(prod));
    return { sku: (prod as any).sku, name: (prod as any).name, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (prod as any).qty ?? 0, category: "" };
  }
  const { data: v } = await sb.from("variants")
    .select("sku,color,qty,wholesale_override,retail_override,mrp_override, product:products(name,base_wholesale,wholesale_override,retail_override,mrp_override)")
    .ilike("sku", exact).limit(1).maybeSingle();
  if (!v || !(v as any).product) return null;
  const p = (v as any).product;
  const ps = resolvePrices(p.base_wholesale, formula, overridesOf(v), overridesOf(p));
  return { sku: (v as any).sku, name: `${p.name}${(v as any).color ? " · " + (v as any).color : ""}`, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (v as any).qty ?? 0, category: "" };
}

async function pieceFromGroup(g: any): Promise<PieceRow | null> {
  const formula = await getPricingFormula();
  const sb = supabaseServer();
  if (g.variant_id) {
    const { data: v } = await sb.from("variants")
      .select("sku,color,qty,wholesale_override,retail_override,mrp_override, product:products(name,base_wholesale,wholesale_override,retail_override,mrp_override)")
      .eq("id", g.variant_id).maybeSingle();
    if (!v || !(v as any).product) return null;
    const p = (v as any).product;
    const ps = resolvePrices(p.base_wholesale, formula, overridesOf(v), overridesOf(p));
    return { sku: (v as any).sku, name: `${p.name}${(v as any).color ? " · " + (v as any).color : ""}`, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (v as any).qty ?? 0, category: "" };
  }
  const { data: prod } = await sb.from("products")
    .select("sku,name,base_wholesale,qty,wholesale_override,retail_override,mrp_override")
    .eq("id", g.product_id).maybeSingle();
  if (!prod) return null;
  const ps = resolvePrices((prod as any).base_wholesale, formula, overridesOf(prod));
  return { sku: (prod as any).sku, name: (prod as any).name, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (prod as any).qty ?? 0, category: "" };
}

const genCode = () => `GRP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** Create a box: a group QR over `pack_qty` units of one piece SKU (product OR variant). */
export async function createBoxGroupAction(input: { sku: string; packQty: number; label?: string }): Promise<{ ok: boolean; code?: string; id?: string; error?: string }> {
  if (!(await requirePerm("catalog.create"))) return { ok: false, error: "Your role can't create box QRs (needs catalogue-create)." };
  const sku = (input.sku ?? "").trim();
  const packQty = Math.floor(Number(input.packQty) || 0);
  if (!sku) return { ok: false, error: "Pick a product or variant SKU for the box." };
  if (packQty < 1) return { ok: false, error: "Pack quantity must be at least 1." };
  const sb = supabaseServer();

  // Resolve the SKU to a product (simple) or a variant (+ its parent product).
  const exact = escapeIlikeExact(sku);
  let productId: string | null = null, variantId: string | null = null, name = "";
  const { data: prod } = await sb.from("products").select("id,name").ilike("sku", exact).maybeSingle();
  if (prod) { productId = (prod as any).id; name = (prod as any).name; }
  else {
    const { data: v } = await sb.from("variants").select("id,product_id,color, product:products(name)").ilike("sku", exact).maybeSingle();
    if (v) { variantId = (v as any).id; productId = (v as any).product_id; name = `${(v as any).product?.name ?? ""}${(v as any).color ? " · " + (v as any).color : ""}`; }
  }
  if (!productId) return { ok: false, error: `No product or variant with SKU ${sku}.` };

  const label = (input.label ?? "").trim() || `${name} · box of ${packQty}`;
  // Generate a unique code (retry a couple times on the tiny chance of a collision).
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = genCode();
    const { data, error } = await sb.from("inventory_groups")
      .insert({ code, label, product_id: productId, variant_id: variantId, pack_qty: packQty, status: "active" })
      .select("id").single();
    if (!error && data) {
      await logActivity({ action: "box_created", ref: code, detail: `${label} → ${sku} ×${packQty}` });
      revalidatePath("/admin/barcodes");
      return { ok: true, code, id: (data as any).id };
    }
    if (error && !/duplicate key|unique/i.test(error.message)) return { ok: false, error: error.message };
  }
  return { ok: false, error: "Could not generate a unique box code — try again." };
}

export type BoxScanResult = {
  ok: boolean;
  code?: string; label?: string; packQty?: number;
  item?: { sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; category: string };
  error?: string;
};

/** POS: resolve a scanned box code → the target piece (priced + live stock) + how many the box holds.
 *  Printed stickers stay valid even if the groups row was archived or later recreated as GRP-…. */
export async function resolveBoxScanAction(raw: string): Promise<BoxScanResult> {
  try {
    const parsed = parseGroupScan(raw);
    const code = parsed?.code ?? (raw ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "empty code" };
    const sb = supabaseServer();

    const lookupByCode = async (c: string) => {
      const exact = escapeIlikeExact(c);
      const { data: g, error } = await sb.from("inventory_groups").select("*").ilike("code", exact).limit(1).maybeSingle();
      if (error) {
        console.error("Box QR lookup failed:", error.message);
        return { error: "Box QR lookup is temporarily unavailable. Do not rescan repeatedly; check the connection and try again." as const, g: null };
      }
      return { error: null, g };
    };

    const fromGroup = async (g: any, packQtyFallback?: number): Promise<BoxScanResult> => {
      const item = await pieceFromGroup(g);
      if (!item) return { ok: false, error: "Box product missing." };
      const packQty = Number((g as any).pack_qty) || packQtyFallback || 1;
      return { ok: true, code: (g as any).code ?? code, label: (g as any).label, packQty, item };
    };

    const byCode = await lookupByCode(code);
    if (byCode.error) return { ok: false, error: byCode.error };
    // Any stored row (active or archived) is enough — hiding/archiving is list-only.
    if (byCode.g) return fromGroup(byCode.g, parsed?.kind === "box" ? parsed.packQty : undefined);

    if (parsed?.kind === "box") {
      // Same design may have been recreated later as a GRP- row; match on piece SKU + pack size.
      const exactSku = escapeIlikeExact(parsed.sku);
      const { data: prod } = await sb.from("products").select("id").ilike("sku", exactSku).limit(1).maybeSingle();
      const { data: variant } = prod
        ? { data: null }
        : await sb.from("variants").select("id,product_id").ilike("sku", exactSku).limit(1).maybeSingle();
      const productId = (prod as any)?.id ?? (variant as any)?.product_id;
      const variantId = (variant as any)?.id ?? null;
      if (productId) {
        let q = sb.from("inventory_groups").select("*").eq("product_id", productId).eq("pack_qty", parsed.packQty);
        q = variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null);
        const { data: g2 } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (g2) return fromGroup(g2, parsed.packQty);
      }

      // Self-contained sticker: the QR already carries the piece SKU and pack count.
      const item = await lookupPieceBySku(parsed.sku);
      if (!item) return { ok: false, error: `No product with SKU ${parsed.sku}.` };
      return {
        ok: true,
        code: parsed.code,
        label: `${item.name} · box of ${parsed.packQty}`,
        packQty: parsed.packQty,
        item,
      };
    }

    return { ok: false, error: "Box QR not recognised." };
  } catch (err) {
    console.error("Box QR lookup threw:", err);
    return { ok: false, error: "Box QR lookup is temporarily unavailable. Do not rescan repeatedly; check the connection and try again." };
  }
}

/**
 * Remove a box QR from the barcodes / label list only.
 * Does NOT invalidate the QR for POS — printed stickers must keep scanning.
 * Sets hidden_from_list=true (and ensures status stays active). Falls back gracefully
 * if the hidden_from_list column is not yet on the DB.
 */
export async function deleteBoxGroupAction(
  idOrForm: string | FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, error: "Your role can't manage box QRs (needs catalogue-create)." };
  }
  const boxId =
    typeof idOrForm === "string"
      ? idOrForm.trim()
      : String(idOrForm.get("id") ?? "").trim();
  if (!boxId) return { ok: false, error: "Missing box id." };
  const sb = supabaseServer();

  // Preferred: hide from list, keep status=active so POS can still resolve the code.
  const { data: hidden, error: hideErr } = await sb
    .from("inventory_groups")
    .update({ hidden_from_list: true, status: "active" })
    .eq("id", boxId)
    .select("id")
    .maybeSingle();

  if (!hideErr && hidden) {
    await logActivity({ action: "box_hidden_from_list", ref: boxId, detail: "list only; POS still valid" });
    revalidatePath("/admin/barcodes");
    revalidatePath("/admin");
    return { ok: true };
  }

  // Column missing on older DBs — cannot safely archive (that breaks POS). Treat as
  // success for UI hide; the row may reappear on full refresh until migration is applied.
  if (hideErr && /hidden_from_list|column|schema cache/i.test(hideErr.message)) {
    revalidatePath("/admin/barcodes");
    revalidatePath("/admin");
    return { ok: true };
  }

  if (hideErr) {
    return { ok: false, error: hideErr.message || "Could not hide the box QR from the list." };
  }

  // Already gone — UI can clear the row.
  revalidatePath("/admin/barcodes");
  revalidatePath("/admin");
  return { ok: true };
}

const HIDE_CHUNK = 80;

function uniqueBoxGroupIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || id.length > 80 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Hide many box QRs from the labels list in one round-trip.
 *
 * "Clear all from list" used to call deleteBoxGroupAction once per row. Each call
 * revalidatePath'd /admin/barcodes, so a list of 125 boxes fired 125 serverless
 * functions and 125 full-page refetches. On Netlify those pile up, time out, and
 * the list comes back as if the button did nothing. Individual Delete still
 * worked because it is one request.
 *
 * Stickers stay valid at POS: we only set hidden_from_list, status stays active.
 */
export async function hideBoxGroupsAction(
  ids: string[],
): Promise<{ ok: boolean; hidden: number; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, hidden: 0, error: "Your role can't manage box QRs (needs catalogue-create)." };
  }
  const unique = uniqueBoxGroupIds(ids);
  if (unique.length === 0) return { ok: true, hidden: 0 };

  const sb = supabaseServer();
  let hidden = 0;
  for (let i = 0; i < unique.length; i += HIDE_CHUNK) {
    const chunk = unique.slice(i, i + HIDE_CHUNK);
    const { data, error } = await sb
      .from("inventory_groups")
      .update({ hidden_from_list: true, status: "active" })
      .in("id", chunk)
      .select("id");
    if (error) {
      if (/hidden_from_list|column|schema cache/i.test(error.message)) {
        return {
          ok: false,
          hidden,
          error: "Cannot hide box QRs until the list-hide column is applied. Printed stickers are unaffected.",
        };
      }
      return { ok: false, hidden, error: error.message || "Could not clear the list." };
    }
    hidden += (data as any[] | null)?.length ?? 0;
  }

  await logActivity({
    action: "box_hidden_from_list",
    ref: "bulk",
    detail: `list only; hid ${hidden || unique.length} box QR(s); POS still valid`,
  });
  revalidatePath("/admin/barcodes");
  revalidatePath("/admin");
  // If RLS hides the RETURNING rows, the update still happened — report the asked-for count.
  return { ok: true, hidden: hidden || unique.length };
}

/**
 * Recovery for the old archive-on-print flow: it set status='archived', which broke POS scanning
 * of stickers already stuck on boxes. Flip those back to active so the counter works again.
 *
 * This deliberately does NOT touch hidden_from_list any more. It used to also set
 * hidden_from_list=true, which — together with migration 0078's bulk update of the same shape —
 * buried every recovered box QR in an invisible state the owner had no way to undo, so
 * /admin/barcodes showed an empty list. Visibility is now the owner's call via
 * restoreHiddenBoxQrsAction / the "Show hidden" toggle on the labels page.
 */
export async function restoreArchivedBoxQrsForPosAction(): Promise<{ ok: boolean; restored: number; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, restored: 0, error: "not permitted" };
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("inventory_groups")
    .update({ status: "active" })
    .eq("status", "archived")
    .select("id");
  if (error) return { ok: false, restored: 0, error: error.message };
  const n = (data as any[] | null)?.length ?? 0;
  if (n) await logActivity({ action: "box_qr_pos_restore", ref: "bulk", detail: `restored ${n} archived box QRs for POS` });
  revalidatePath("/admin/barcodes");
  return { ok: true, restored: n };
}

/**
 * Put a hidden box QR back on the labels list. The inverse of deleteBoxGroupAction, so a row
 * removed from the list (or buried by migration 0078) is always recoverable in one click.
 * Pass no id to restore every hidden row at once.
 */
export async function restoreHiddenBoxQrsAction(
  boxId?: string,
): Promise<{ ok: boolean; restored: number; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, restored: 0, error: "Your role can't manage box QRs (needs catalogue-create)." };
  }
  const sb = supabaseServer();
  const id = (boxId ?? "").trim();
  let q = sb.from("inventory_groups").update({ hidden_from_list: false, status: "active" });
  q = id ? q.eq("id", id) : q.eq("hidden_from_list", true);
  const { data, error } = await q.select("id");

  if (error) {
    // Column not migrated yet → nothing is hidden in the first place, so this is already a no-op.
    if (/hidden_from_list|column|schema cache/i.test(error.message)) {
      revalidatePath("/admin/barcodes");
      return { ok: true, restored: 0 };
    }
    return { ok: false, restored: 0, error: error.message || "Could not restore the box QR." };
  }

  const n = (data as any[] | null)?.length ?? 0;
  if (n) await logActivity({ action: "box_qr_restored_to_list", ref: id || "bulk", detail: `restored ${n} box QR(s) to the labels list` });
  revalidatePath("/admin/barcodes");
  revalidatePath("/admin");
  return { ok: true, restored: n };
}
