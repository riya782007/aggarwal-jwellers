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

const genCode = () => `GRP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** Pull a bare group code out of a scanned string: a `<site>/g/<code>` URL or a raw `GRP-…`.
 *  Local helper (a "use server" module may only EXPORT async functions). */
function groupCodeFromScan(raw: string): string | null {
  const s = (raw ?? "").trim();
  const m = s.match(/\/g\/([A-Za-z0-9%._-]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  if (/^GRP-[A-Za-z0-9]+$/i.test(s)) return s.toUpperCase();
  return null;
}

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
 * Remove a box QR from the barcodes list.
 * Accepts either a plain id string (client call) or FormData (form action).
 * Soft-delete (status=archived) first so the row disappears from getBoxGroups;
 * then attempt hard-delete. Always revalidate so the list updates on next load.
 */
export async function deleteBoxGroupAction(
  idOrForm: string | FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requirePerm("catalog.create"))) {
    return { ok: false, error: "Your role can't delete box QRs (needs catalogue-create)." };
  }
  const boxId =
    typeof idOrForm === "string"
      ? idOrForm.trim()
      : String(idOrForm.get("id") ?? "").trim();
  if (!boxId) return { ok: false, error: "Missing box id." };
  const sb = supabaseServer();

  // Soft-delete first (schema uses active | archived). Guarantees the list hides the row
  // even when hard-delete is blocked by FKs / policies.
  const { data: updated, error: updErr } = await sb
    .from("inventory_groups")
    .update({ status: "archived" })
    .eq("id", boxId)
    .select("id")
    .maybeSingle();

  if (updErr) {
    return { ok: false, error: updErr.message || "Could not archive the box QR." };
  }
  if (!updated) {
    // Already gone or wrong id — treat as success so the UI can clear the row.
    revalidatePath("/admin/barcodes");
    revalidatePath("/admin");
    return { ok: true };
  }

  // Best-effort hard delete (ignore failure).
  await sb.from("inventory_groups").delete().eq("id", boxId);

  await logActivity({ action: "box_deleted", ref: boxId, detail: "archived+removed" });
  revalidatePath("/admin/barcodes");
  revalidatePath("/admin");
  return { ok: true };
}
