import "server-only";

/**
 * Keep variant SKUs in sync when a product's SKU is renamed.
 *
 * Variant SKUs are auto-derived as "{parentSku}-{suffix}" (e.g. AJSIGDE391-28, AJTESBR-522-GREEN).
 * If the parent SKU is later edited, the variants used to keep the OLD base (AJ1000-28 under a
 * product now called AJSIGDE542) — so the catalogue showed a variant SKU unrelated to its parent.
 *
 * This rewrites every variant whose SKU was derived from the old parent ("{old}-XX" or exactly
 * "{old}") to use the new parent, preserving the suffix ("{new}-XX"). Variants with a fully custom,
 * unrelated SKU are left untouched. Best-effort and collision-safe: skips any target SKU that is
 * already taken, and never lets a hiccup block the rename itself.
 */
export async function cascadeVariantSkuRename(
  sb: any,
  productId: string,
  oldSku: string,
  newSku: string,
): Promise<number> {
  let changed = 0;
  try {
    const o = (oldSku || "").trim();
    const n = (newSku || "").trim();
    if (!productId || !o || !n || o.toUpperCase() === n.toUpperCase()) return 0;
    const { data: vars } = await sb.from("variants").select("id,sku").eq("product_id", productId);
    for (const v of ((vars as any[]) ?? [])) {
      const s = String(v.sku ?? "");
      let next: string | null = null;
      if (s.toUpperCase() === o.toUpperCase()) next = n;
      else if (s.toUpperCase().startsWith(o.toUpperCase() + "-")) next = n + s.slice(o.length);
      if (!next || next === s) continue;
      // Don't clobber a SKU already used by another variant.
      const { data: clash } = await sb.from("variants").select("id").eq("sku", next).neq("id", v.id).maybeSingle();
      if (clash) continue;
      const { error } = await sb.from("variants").update({ sku: next }).eq("id", v.id);
      if (!error) changed++;
    }
  } catch {
    /* never block the parent rename on a cascade problem */
  }
  return changed;
}
