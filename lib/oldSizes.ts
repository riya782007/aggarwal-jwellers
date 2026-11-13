/**
 * lib/oldSizes.ts — "Combine sizes into one item" (owner request, Nov 2026).
 *
 * When a product with size/colour variants is turned into ONE plain item, any variant that already
 * appears on bills, purchases or estimates can't be deleted (that would break those records). Such
 * variants are parked on a hidden ARCHIVE product whose SKU ends with this suffix, renamed with
 * OLD_VARIANT_SUFFIX — so old bills still show which size was sold, while the shop sees one item.
 * Billing never lists archive products.
 */
export const ARCHIVE_PRODUCT_SUFFIX = "-OLDSIZES";
export const OLD_VARIANT_SUFFIX = "-OLD";

export function isArchiveProductSku(sku: string | null | undefined): boolean {
  return String(sku ?? "").toUpperCase().endsWith(ARCHIVE_PRODUCT_SUFFIX);
}
