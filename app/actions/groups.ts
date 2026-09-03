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
import { groupCodeFromScan } from "@/lib/groupQr";

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
  let productId: string | null = null, variantId: string | null = null, name = "";
  const { data: prod } = await sb.from("products").select("id,name").ilike("sku", sku).maybeSingle();
  if (prod) { productId = (prod as any).id; name = (prod as any).name; }
  else {
    const { data: v } = await sb.from("variants").select("id,product_id,color, product:products(name)").ilike("sku", sku).maybeSingle();
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

/** POS: resolve a scanned box code → the target piece (priced + live stock) + how many the box holds. */
export async function resolveBoxScanAction(raw: string): Promise<BoxScanResult> {
  try {
    const code = groupCodeFromScan(raw) ?? (raw ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "empty code" };
    const sb = supabaseServer();
    const { data: g } = await sb.from("inventory_groups").select("*").eq("code", code).maybeSingle();
    if (!g || (g as any).status !== "active") return { ok: false, error: "Box QR not recognised." };
    const formula = await getPricingFormula();

    if ((g as any).variant_id) {
      const { data: v } = await sb.from("variants")
        .select("sku,color,qty,wholesale_override,retail_override,mrp_override, product:products(name,base_wholesale,wholesale_override,retail_override,mrp_override)")
        .eq("id", (g as any).variant_id).maybeSingle();
      if (!v || !(v as any).product) return { ok: false, error: "Box product missing." };
      const p = (v as any).product;
      const ps = resolvePrices(p.base_wholesale, formula, overridesOf(v), overridesOf(p));
      return { ok: true, code, label: (g as any).label, packQty: (g as any).pack_qty,
        item: { sku: (v as any).sku, name: `${p.name}${(v as any).color ? " · " + (v as any).color : ""}`, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (v as any).qty ?? 0, category: "" } };
    }

    const { data: prod } = await sb.from("products")
      .select("sku,name,base_wholesale,qty,wholesale_override,retail_override,mrp_override")
      .eq("id", (g as any).product_id).maybeSingle();
    if (!prod) return { ok: false, error: "Box product missing." };
    const ps = resolvePrices((prod as any).base_wholesale, formula, overridesOf(prod));
    return { ok: true, code, label: (g as any).label, packQty: (g as any).pack_qty,
      item: { sku: (prod as any).sku, name: (prod as any).name, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (prod as any).qty ?? 0, category: "" } };
  } catch {
    return { ok: false, error: "lookup failed" };
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

/**
 * One-shot recovery: previously we archived on print/delete, which broke POS scanning
 * of stickers already stuck on boxes. Restore those to active + hidden_from_list so
 * POS works again and they stay off the barcodes list.
 */
export async function restoreArchivedBoxQrsForPosAction(): Promise<{ ok: boolean; restored: number; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, restored: 0, error: "not permitted" };
  }
  const sb = supabaseServer();
  // Prefer setting hidden_from_list if the column exists.
  const { data, error } = await sb
    .from("inventory_groups")
    .update({ status: "active", hidden_from_list: true })
    .eq("status", "archived")
    .select("id");
  if (!error) {
    const n = (data as any[] | null)?.length ?? 0;
    if (n) await logActivity({ action: "box_qr_pos_restore", ref: "bulk", detail: `restored ${n} archived box QRs for POS` });
    revalidatePath("/admin/barcodes");
    return { ok: true, restored: n };
  }
  // Column missing: just flip status back to active (they will show in the list until hide column exists).
  if (/hidden_from_list|column|schema cache/i.test(error.message)) {
    const { data: d2, error: e2 } = await sb
      .from("inventory_groups")
      .update({ status: "active" })
      .eq("status", "archived")
      .select("id");
    if (e2) return { ok: false, restored: 0, error: e2.message };
    const n = (d2 as any[] | null)?.length ?? 0;
    revalidatePath("/admin/barcodes");
    return { ok: true, restored: n };
  }
  return { ok: false, restored: 0, error: error.message };
}
