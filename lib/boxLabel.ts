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
 * QR sizing. What decides whether a sticker scans is the MODULE size (the width of one black
 * square), not how big the QR looks. Fitting every QR into one fixed box made module size depend
 * on how long the SKU is: a short code printed 0.66mm modules, a longer one 0.58mm, and a very
 * long one would have printed 0.42mm — all silently, with no warning.
 *
 * So we fix the module size instead and let the QR's overall size vary with the payload. Every
 * sticker then carries the same, known-good module, and a long SKU simply prints a slightly
 * larger square rather than a denser, riskier one.
 *
 * 1pt = 1/72in = 0.3528mm.
 *   preferred 1.86pt = 0.657mm — what a short SKU already prints today, kept as the target
 *   minimum   1.42pt = 0.500mm — below this a 203dpi thermal head has under 4 dots per module
 *                                and print bleed starts eating the pattern
 */
export const QR_SIZING = {
  /** Target module size (pt). Used whenever the resulting QR fits maxBox. */
  preferredModulePt: 54 / 29,
  /** Hard floor (pt). A label that cannot reach this is refused rather than printed. */
  minModulePt: 0.5 / 0.3528,
  /** Largest square the QR may occupy on a 2in × 1in sticker, quiet zone included. */
  maxBoxPt: 62,
} as const;

/** Quiet zone required by the QR spec, in modules, on every edge. */
export const QR_QUIET_MODULES = 4;

/**
 * Module size + box for a QR of `n` modules a side (excluding the quiet zone).
 * Returns `ok: false` when even the floor cannot fit, so the caller can refuse to print
 * instead of emitting a sticker nobody can scan.
 */
export function qrLayout(n: number): { ok: boolean; modulePt: number; boxPt: number } {
  const total = Math.max(1, Math.floor(n)) + QR_QUIET_MODULES * 2;
  const preferredBox = total * QR_SIZING.preferredModulePt;
  if (preferredBox <= QR_SIZING.maxBoxPt) {
    return { ok: true, modulePt: QR_SIZING.preferredModulePt, boxPt: preferredBox };
  }
  // Too big at the target size — shrink the module just enough to fit the biggest allowed box.
  const modulePt = QR_SIZING.maxBoxPt / total;
  return { ok: modulePt >= QR_SIZING.minModulePt, modulePt, boxPt: QR_SIZING.maxBoxPt };
}

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

/**
 * Text origin + max width for sticker slot 0 (left) or 1 (right) on the 4in web.
 * `qrBoxPt` is how much width the QR actually took (it now varies with the payload); it
 * defaults to the old fixed box so existing callers keep the same geometry.
 */
export function thermalTextBox(
  slotIndex: number,
  qrBoxPt: number = THERMAL_LABEL.qr,
): { xoff: number; tx: number; maxW: number } {
  const xoff = (slotIndex & 1) * THERMAL_LABEL.half;
  const box = Math.max(0, Number(qrBoxPt) || 0);
  const tx = xoff + THERMAL_LABEL.pad + box + THERMAL_LABEL.qrTextGap;
  // Never let the text box go negative, however wide the QR got.
  const maxW = Math.max(0, xoff + THERMAL_LABEL.half - THERMAL_LABEL.pad - tx);
  return { xoff, tx, maxW };
}
