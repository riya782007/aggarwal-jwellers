import "server-only";

/**
 * Remember a SKU that is about to stop existing (rename) so stickers already printed with it
 * keep scanning at POS / Estimates. Best-effort: a DB without migration 0079 (sku_aliases), or any
 * other hiccup, must never block the rename itself.
 */
export async function recordSkuAlias(
  sb: any,
  oldSku: string,
  target: { productId: string; variantId?: string | null },
): Promise<void> {
  const alias = String(oldSku ?? "").trim().toUpperCase();
  if (!alias || !target?.productId) return;
  try {
    const { error } = await sb
      .from("sku_aliases")
      .upsert({ alias, product_id: target.productId, variant_id: target.variantId ?? null }, { onConflict: "alias" });
    if (error) console.warn("sku alias not saved — apply docs/0079_sku_aliases.sql:", error.message);
  } catch (err) {
    console.warn("sku alias not saved:", err);
  }
}

/**
 * Every alias as { OLD_SKU: CURRENT_SKU } for the counter's in-memory index, so an old sticker
 * resolves instantly with no server trip. Returns {} when the table isn't there yet.
 */
export async function getSkuAliasMap(sb: any): Promise<Record<string, string>> {
  try {
    const { data, error } = await sb
      .from("sku_aliases")
      .select("alias, product:products(sku), variant:variants(sku)")
      .limit(5000);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const r of data as any[]) {
      const current = r.variant?.sku ?? r.product?.sku;
      if (r.alias && current && String(current).toUpperCase() !== String(r.alias).toUpperCase()) out[r.alias] = current;
    }
    return out;
  } catch {
    return {};
  }
}

/** Server lookup of ONE old sticker code → the current product / variant row ids. */
export async function resolveSkuAlias(
  sb: any,
  codes: string[],
): Promise<{ productId: string; variantId: string | null } | null> {
  const wanted = [...new Set(codes.map((c) => String(c ?? "").trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) return null;
  try {
    const { data, error } = await sb.from("sku_aliases").select("alias,product_id,variant_id").in("alias", wanted);
    if (error || !data?.length) return null;
    // Keep the caller's preference order (literal scan first).
    for (const w of wanted) {
      const hit = (data as any[]).find((r) => r.alias === w);
      if (hit) return { productId: hit.product_id, variantId: hit.variant_id ?? null };
    }
    return null;
  } catch {
    return null;
  }
}
