/** Scanner payload normalization for POS and estimates.
 * Legacy label printers often emit spaces between SKU segments (for example
 * `K12 A78271305`), while manually entered SKUs are stored as `K12-A78271305`.
 * Keep the literal value first; normalized values are fallbacks only.
 */
export function skuCandidatesFromScan(raw: string): string[] {
  const trimmed = raw.trim();
  const urlSku = trimmed.match(/\/p\/([A-Za-z0-9%._-]+)/)?.[1];
  let literal = urlSku ?? trimmed;
  try { literal = decodeURIComponent(literal); } catch { /* retain undecoded scanner value */ }

  const normalized = literal.replace(/\s+/g, "-");
  return [...new Set([literal, normalized].filter(Boolean))];
}
