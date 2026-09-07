/**
 * Shared box-QR sticker copy + thermal 2-up geometry.
 * Kept free of DOM / jsPDF so POS, catalogue, and tests can use it safely.
 */

/** Thermal 2-up geometry (pt). Each sticker is HALF × pageH. */
export const THERMAL_LABEL = {
  pageW: 288,
  pageH: 72,
  half: 144,
  pad: 6,
  qr: 54,
  qrTextGap: 8,
  maxBaseline: 66,
} as const;

/**
 * Group codes are stored as `GRP-XXXXXX`. Never prefix another "GRP " — that printed
 * "GRP GRP-…" and the extra characters ran into the neighbouring 2in sticker.
 */
export function formatBoxLabelLine(code: string, packQty: number): string {
  let id = String(code ?? "").trim();
  // Collapse "GRP GRP-JS3JA8" / "GRP-GRP-…" into a single GRP- token.
  id = id.replace(/^(?:GRP[\s-]+)+/i, "");
  id = id.replace(/^-+/, "");
  if (!id) id = "BOX";
  if (!/^GRP-/i.test(id)) id = `GRP-${id}`;
  const n = Math.max(1, Math.floor(Number(packQty) || 1));
  const line = `${id} · BOX ${n}`;
  return line.replace(/GRP\s+GRP/gi, "GRP").replace(/GRP-GRP-/gi, "GRP-");
}

/** Text origin + max width for sticker slot 0 (left) or 1 (right) on the 4in web. */
export function thermalTextBox(slotIndex: number): { xoff: number; tx: number; maxW: number } {
  const xoff = (slotIndex & 1) * THERMAL_LABEL.half;
  const tx = xoff + THERMAL_LABEL.pad + THERMAL_LABEL.qr + THERMAL_LABEL.qrTextGap;
  const maxW = xoff + THERMAL_LABEL.half - THERMAL_LABEL.pad - tx;
  return { xoff, tx, maxW };
}
