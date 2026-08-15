"use server";
/**
 * Box / group QR — a convenience aggregation over individually-tracked units.
 * A box is ONE QR that resolves to a piece SKU + a pack count. Scanning it at the POS adds N
 * individual units to the bill. Stock lives on the piece (product/variant qty); the box holds none,
 * so its availability is always derived from the piece's live stock. Homogeneous boxes only.
 *
 * The QR payload is BOX:<pieceSku>:<packQty> (the real SKU of items in the box). Legacy stickers
 * that encoded GRP-XXXXXX still resolve via inventory_groups.code.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { getPricingFormula } from "@/lib/supabase/queries";
import { resolvePrices, overridesOf } from "@/lib/pricing";
import { logActivity } from "@/lib/audit";
import { boxQrPayload, parseBoxScan } from "@/lib/boxQr";

type PieceRow = { sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; category: string };

async function lookupPieceBySku(sku: string): Promise<PieceRow | null> {
  const sb = supabaseServer();
  const formula = await getPricingFormula();
  const { data: prod } = await sb.from("products")
    .select("sku,name,base_wholesale,qty,wholesale_override,retail_override,mrp_override")
    .ilike("sku", sku).maybeSingle();
  if (prod) {
    const ps = resolvePrices((prod as any).base_wholesale, formula, overridesOf(prod));
    return { sku: (prod as any).sku, name: (prod as any).name, price: ps.retailPrice, wholesale: ps.wholesaleRate, mrp: ps.mrp, qty: (prod as any).qty ?? 0, category: "" };
  }
  const { data: v } = await sb.from("variants")
    .select("sku,color,qty,wholesale_override,retail_override,mrp_override, product:products(name,base_wholesale,wholesale_override,retail_override,mrp_override)")
    .ilike("sku", sku).maybeSingle();
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

/** Create a box: a group QR over `pack_qty` units of one piece SKU (product OR variant). */
export async function createBoxGroupAction(input: { sku: string; packQty: number; label?: string }): Promise<{ ok: boolean; code?: string; id?: string; error?: string }> {
  if (!(await requirePerm("catalog.create"))) return { ok: false, error: "Your role can't create box QRs (needs catalogue-create)." };
  const sku = (input.sku ?? "").trim();
  const packQty = Math.floor(Number(input.packQty) || 0);
  if (!sku) return { ok: false, error: "Pick a product or variant SKU for the box." };
  if (packQty < 1) return { ok: false, error: "Pack quantity must be at least 1." };
  const sb = supabaseServer();

  let productId: string | null = null, variantId: string | null = null, name = "", storedSku = sku;
  const { data: prod } = await sb.from("products").select("id,name,sku").ilike("sku", sku).maybeSingle();
  if (prod) { productId = (prod as any).id; name = (prod as any).name; storedSku = (prod as any).sku ?? sku; }
  else {
    const { data: v } = await sb.from("variants").select("id,product_id,sku,color, product:products(name)").ilike("sku", sku).maybeSingle();
    if (v) { variantId = (v as any).id; productId = (v as any).product_id; name = `${(v as any).product?.name ?? ""}${(v as any).color ? " · " + (v as any).color : ""}`; storedSku = (v as any).sku ?? sku; }
  }
  if (!productId) return { ok: false, error: `No product or variant with SKU ${sku}.` };

  const label = (input.label ?? "").trim() || `${name} · box of ${packQty}`;
  const code = boxQrPayload(storedSku, packQty);

  let existingQ = sb.from("inventory_groups").select("id,code").eq("product_id", productId).eq("pack_qty", packQty).eq("status", "active");
  existingQ = variantId ? existingQ.eq("variant_id", variantId) : existingQ.is("variant_id", null);
  const { data: existing } = await existingQ.maybeSingle();
  if (existing) {
    revalidatePath("/admin/barcodes");
    return { ok: true, code: (existing as any).code, id: (existing as any).id };
  }

  const { data, error } = await sb.from("inventory_groups")
    .insert({ code, label, product_id: productId, variant_id: variantId, pack_qty: packQty, status: "active" })
    .select("id").single();
  if (error) return { ok: false, error: error.message };
  await logActivity({ action: "box_created", ref: code, detail: `${label} → ${storedSku} ×${packQty}` });
  revalidatePath("/admin/barcodes");
  return { ok: true, code, id: (data as any).id };
}

export type BoxScanResult = {
  ok: boolean;
  code?: string; label?: string; packQty?: number;
  item?: { sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; category: string };
  error?: string;
};

/** POS/estimates: resolve a scanned box QR → the target piece (priced + live stock) + pack count. */
export async function resolveBoxScanAction(raw: string): Promise<BoxScanResult> {
  try {
    const parsed = parseBoxScan(raw);
    if (!parsed) return { ok: false, error: "Box QR not recognised." };
    const sb = supabaseServer();

    if (parsed.kind === "legacyCode") {
      const { data: g } = await sb.from("inventory_groups").select("*").eq("code", parsed.code).maybeSingle();
      if (!g || (g as any).status !== "active") return { ok: false, error: "Box QR not recognised." };
      const item = await pieceFromGroup(g);
      if (!item) return { ok: false, error: "Box product missing." };
      return { ok: true, code: parsed.code, label: (g as any).label, packQty: (g as any).pack_qty, item };
    }

    const payload = boxQrPayload(parsed.sku, parsed.packQty);
    const { data: byCode } = await sb.from("inventory_groups").select("*").eq("code", payload).maybeSingle();
    if (byCode && (byCode as any).status === "active") {
      const item = await pieceFromGroup(byCode);
      if (item) return { ok: true, code: payload, label: (byCode as any).label, packQty: (byCode as any).pack_qty || parsed.packQty, item };
    }

    const item = await lookupPieceBySku(parsed.sku);
    if (!item) return { ok: false, error: `No product with SKU ${parsed.sku}.` };
    return { ok: true, code: payload, label: `${item.name} · box of ${parsed.packQty}`, packQty: parsed.packQty, item };
  } catch {
    return { ok: false, error: "lookup failed" };
  }
}

export async function deleteBoxGroupAction(formData: FormData): Promise<void> {
  if (!(await requirePerm("catalog.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseServer().from("inventory_groups").delete().eq("id", id);
  revalidatePath("/admin/barcodes");
}
