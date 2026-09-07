/** Scanner payload normalization for POS and estimates.
 * Hardware wedges, phone cameras, and label printers all emit slightly different strings
 * for the same sticker. Keep the literal value first; normalized values are fallbacks only.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f\u00ad]/g;

/** Strip wrapper junk HID scanners and Code-39 printers add around a SKU. */
export function normalizeScanPayload(raw: string): string {
  let s = (raw ?? "").replace(CONTROL_CHARS, "").trim();
  // Code-39 often wraps the payload in asterisks: *AJ1004*
  if (s.length >= 3 && s.startsWith("*") && s.endsWith("*")) s = s.slice(1, -1).trim();
  return s;
}

function decodeSkuToken(token: string): string {
  let t = token;
  try { t = decodeURIComponent(t); } catch { /* retain undecoded scanner value */ }
  return t.replace(/[?#].*$/, "");
}

export function skuCandidatesFromScan(raw: string): string[] {
  const trimmed = normalizeScanPayload(raw);
  if (!trimmed) return [];

  const urlSku =
    trimmed.match(/\/p\/([A-Za-z0-9%._\-]+)/i)?.[1] ??
    trimmed.match(/[?&]sku=([A-Za-z0-9%._\-]+)/i)?.[1];
  let literal = decodeSkuToken(urlSku ?? trimmed);

  const dashed = literal.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  const compact = literal.replace(/[\s_\-]+/g, "");
  const upper = literal.toUpperCase();
  return [...new Set([literal, dashed, compact, upper, dashed.toUpperCase(), compact.toUpperCase()].filter(Boolean))];
}

/** True when the payload looks like a scanned SKU rather than a product-name search. */
export function looksLikeSkuScan(raw: string): boolean {
  const s = normalizeScanPayload(raw);
  if (s.length < 3 || s.length > 64) return false;
  if (/^https?:\/\//i.test(s) || /\/p\//i.test(s) || /^GRP-/i.test(s)) return true;
  const compact = s.replace(/\s+/g, "-");
  return /^[A-Za-z0-9._\-\/]+$/.test(compact) && /[A-Za-z]/.test(compact) && /[0-9]/.test(compact);
}

export function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
