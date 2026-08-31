"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import { inferStockKind } from "@/lib/stockKind";

/**
 * Adjust stock by a signed delta, tagged with a SOURCE + typed KIND so every movement
 * is traceable. Works at PRODUCT level, or at VARIANT level when `variant_id` is given
 * (in which case the product's qty is rolled up from the sum of its variants).
 * Logged to stock_adjustments.
 */
export async function adjustStockAction(formData: FormData): Promise<void> {
  // SKUs are stored upper-case; the owner often types "Bd1001". Normalise so a
  // case/spacing slip never silently no-ops ("Apply does nothing").
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const variantId = String(formData.get("variant_id") ?? "").trim() || null;
  const delta = Math.trunc(Number(formData.get("delta") ?? 0));
  const source = String(formData.get("source") ?? "").trim() || "Manual adjustment";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "").trim() || inferStockKind(source);
  if (!sku || !delta) return;
  // Strict: adding needs inventory.add, removing needs inventory.remove.
  if (!(await requirePerm(delta > 0 ? "inventory.add" : "inventory.remove"))) return;

  const sb = supabaseServer();
  const now = new Date().toISOString();
  // Case-insensitive so a typed "Bd1001" still resolves to the stored "AJ1001".
  const { data: p } = await sb.from("products").select("id,qty").ilike("sku", sku).maybeSingle();

  if (!p) {
    // Not a product SKU — it may be a VARIANT's own SKU (e.g. a scanned variant barcode
    // or a colour/size SKU typed directly). Adjust the variant and roll the product up.
    const { data: v } = await sb.from("variants").select("id,qty,product_id,sku").ilike("sku", sku).maybeSingle();
    if (!v) return;
    const vid = (v as any).id, pid = (v as any).product_id;
    const oldQ = (v as any).qty ?? 0;
    const vNew = Math.max(0, oldQ + delta);
    const applied = vNew - oldQ;
    if (applied === 0) return; // already at 0 — never log a phantom movement
    await sb.from("variants").update({ qty: vNew }).eq("id", vid);
    const { data: siblings } = await sb.from("variants").select("qty").eq("product_id", pid);
    const total = ((siblings as any[]) ?? []).reduce((s, x) => s + (x.qty ?? 0), 0);
    await sb.from("products").update({ qty: total, last_movement_at: now }).eq("id", pid);
    await sb.from("stock_adjustments").insert({ product_id: pid, variant_id: vid, sku: (v as any).sku ?? sku, delta: applied, source, reason, kind });
  } else {
    const pid = (p as any).id;
    if (variantId) {
      // Variant-level: adjust the variant, then roll the product qty up to the variant sum.
      const { data: v } = await sb.from("variants").select("id,qty,sku").eq("id", variantId).eq("product_id", pid).maybeSingle();
      if (!v) return;
      const oldQ = (v as any).qty ?? 0;
      const vNew = Math.max(0, oldQ + delta);
      const applied = vNew - oldQ;
      if (applied === 0) return; // nothing to remove (already 0) — no phantom -10 movements
      await sb.from("variants").update({ qty: vNew }).eq("id", variantId);
      const { data: siblings } = await sb.from("variants").select("qty").eq("product_id", pid);
      const total = ((siblings as any[]) ?? []).reduce((s, x) => s + (x.qty ?? 0), 0);
      await sb.from("products").update({ qty: total, last_movement_at: now }).eq("id", pid);
      await sb.from("stock_adjustments").insert({ product_id: pid, variant_id: variantId, sku: (v as any).sku ?? sku, delta: applied, source, reason, kind });
    } else {
      const oldQ = (p as any).qty ?? 0;
      const newQty = Math.max(0, oldQ + delta);
      const applied = newQty - oldQ;
      if (applied === 0) return; // already at the floor — don't log a phantom movement
      await sb.from("products").update({ qty: newQty, last_movement_at: now }).eq("id", pid);
      await sb.from("stock_adjustments").insert({ product_id: pid, sku, delta: applied, source, reason, kind });
    }
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/catalogue/${sku}`);
  revalidatePath(`/admin/product/${sku}`);
}

/**
 * Removes the complete currently-recorded quantity for selected products during a physical
 * inventory cleanup. Each applied change is recorded in the existing stock ledger; products
 * and their sales history are retained for auditability.
 */
export async function bulkRemoveStockAction(input: { skus?: string[]; reason?: string }): Promise<{ ok: boolean; removed: number; products: number; skipped: number; error?: string }> {
  if (!(await requirePerm("inventory.remove"))) return { ok: false, removed: 0, products: 0, skipped: 0, error: "Your role can't remove stock." };
  const skus = [...new Set((input.skus ?? []).map((sku) => String(sku).trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  const reason = String(input.reason ?? "").trim();
  if (!skus.length) return { ok: false, removed: 0, products: 0, skipped: 0, error: "Select at least one product." };
  if (!reason) return { ok: false, removed: 0, products: 0, skipped: 0, error: "Add a cleanup reason for the stock ledger." };

  const sb = supabaseServer();
  let removed = 0, products = 0, skipped = 0;
  for (const sku of skus) {
    // Read immediately before the adjustment so the ledger reflects the quantity that was
    // actually on hand at cleanup time, not the quantity rendered when the review opened.
    const { data: product, error } = await sb.from("products").select("id,sku,qty,variants(id)").eq("sku", sku).maybeSingle();
    if (error) return { ok: false, removed, products, skipped, error: error.message };
    const current = product?.qty ?? 0;
    if (!product || current <= 0 || ((product.variants as any[]) ?? []).length > 0) { skipped++; continue; }
    const now = new Date().toISOString();
    const update = await sb.from("products").update({ qty: 0, last_movement_at: now }).eq("id", product.id).eq("qty", current).select("id");
    // A concurrent sale or adjustment changed the on-hand value. Leave it untouched rather
    // than writing a stale value; the owner can refresh and review the current balance.
    if (update.error) return { ok: false, removed, products, skipped, error: update.error.message };
    if (!update.data?.length) { skipped++; continue; }
    const ledger = await sb.from("stock_adjustments").insert({ product_id: product.id, sku: product.sku, delta: -current, source: "Monthly inventory cleanup", reason, kind: "adjustment", created_by: "owner" });
    if (ledger.error) {
      // Restore only if no intervening write occurred; otherwise retain the current stock and
      // surface the error rather than overwriting a newer sale or adjustment.
      await sb.from("products").update({ qty: current, last_movement_at: now }).eq("id", product.id).eq("qty", 0);
      return { ok: false, removed, products, skipped, error: ledger.error.message };
    }
    removed += current;
    products++;
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/stock-movements");
  return { ok: true, removed, products, skipped };
}
