/**
 * lib/priceCode.ts — the owner's coded price scheme, in ONE place.
 *
 *   A  +  7{wholesale}7  +  {retail}  +  51
 *
 * Starts with "A", wholesale sits between the two 7s, retail follows, always ends "51".
 * e.g. wholesale ₹500, retail ₹1000 -> "A75007100051". Staff decode it at a glance; a customer
 * glancing at the tag can read neither true price. Decimals are dropped — rupees only.
 *
 * This lived as three separate copies (piece labels, box QR maker, product box QR). A sticker
 * carries a real price onto a physical item, so the copies must never drift: every label surface
 * now calls these helpers. Kept DOM-free so it is unit-testable and safe on the server.
 */

/** Rupee integer as a digit string. "" when there is no usable amount. */
function rupeeDigits(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return "";
    return String(Math.round(value));
  }
  // Strings come from editable inputs: drop anything after the decimal point, keep digits only.
  const digits = value.trim().split(".")[0].replace(/[^\d]/g, "");
  return digits && Number(digits) > 0 ? digits : "";
}

/** Paise (how prices are stored) → rupee integer string. "" when absent or non-positive. */
export function rupeesFromPaise(paise: number | null | undefined): string {
  if (paise == null || !Number.isFinite(paise) || paise <= 0) return "";
  return String(Math.round(paise / 100));
}

/**
 * Build the printed price code from rupee amounts (numbers or user-typed strings).
 * Returns "" when neither part is usable, so callers can omit the line entirely.
 */
export function formatPriceCode(
  wholesale: string | number | null | undefined,
  retail: string | number | null | undefined,
): string {
  const w = rupeeDigits(wholesale);
  const r = rupeeDigits(retail);
  if (!w && !r) return "";
  return `A${w ? `7${w}7` : ""}${r}51`;
}

/** Same code, straight from stored paise — the server-side shape used by box + catalogue labels. */
export function priceCodeFromPaise(
  wholesalePaise: number | null | undefined,
  retailPaise: number | null | undefined,
): string {
  return formatPriceCode(rupeesFromPaise(wholesalePaise), rupeesFromPaise(retailPaise));
}
