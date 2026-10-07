/**
 * lib/tspl.ts — the same 2in × 1in stickers as lib/labelPdf.ts, as TSPL commands for a
 * Bluetooth label printer (used only inside the Android app; the website keeps the PDF path).
 *
 * Pure and DOM-free so it is unit-testable and identical everywhere.
 *
 * - The QR is drawn from OUR qrMatrix (same matrix as the screen + PDF), as BAR runs, so what
 *   scans on screen scans on paper. Printer-side QR encoders can pick a different version/ECC.
 * - Text uses the printer's built-in monospaced fonts, so fitting is exact character counting.
 * - Output is plain ASCII (non-ASCII is stripped) — safe over any Bluetooth bridge.
 */
import { QR_QUIET_ZONE_MODULES, qrMatrix } from "@/lib/qr";
import type { PdfLabel } from "@/lib/labelPdf";

export type TsplLayout = "2up" | "1up";
export type TsplOptions = {
  /** Dots per mm: 8 = 203 dpi, 12 = 300/304 dpi. */
  dpmm: 8 | 12;
  /** "2up" = two 2in stickers side by side on a 4in roll (today's layout); "1up" = 2in roll. */
  layout: TsplLayout;
  /** Gap between stickers on the roll, in mm. */
  gapMm?: number;
  /** Print darkness 0–15. */
  density?: number;
};

export const DEFAULT_TSPL: TsplOptions = { dpmm: 12, layout: "2up", gapMm: 2, density: 10 };

/** Built-in TSPL font cell sizes (width × height, dots) — TSC reference for 203 vs 300 dpi. */
const FONTS: Record<8 | 12, Record<"1" | "2" | "3", { w: number; h: number }>> = {
  8: { "1": { w: 8, h: 12 }, "2": { w: 12, h: 20 }, "3": { w: 16, h: 24 } },
  12: { "1": { w: 12, h: 20 }, "2": { w: 16, h: 28 }, "3": { w: 24, h: 32 } },
};

const STICKER_IN = { w: 2, h: 1 };
const IN_MM = 25.4;

/** ASCII-only, no quotes/backslashes (they would break the TSPL string literal). */
export function tsplSafe(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/₹/g, "Rs")
    .replace(/\s*·\s*/g, " / ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "'")
    .trim();
}

/** Clip to `max` characters, marking a cut with a trailing "." so staff know it was shortened. */
function clip(s: string, max: number): string {
  if (max <= 0) return "";
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + ".";
}

/** Split a name into at most `lines` lines of `max` chars, breaking on spaces where possible. */
export function wrapText(s: string, max: number, lines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length <= max) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = w.length > max ? w.slice(0, max) : w;
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  if (out.length > lines) out.length = lines;
  // Signal truncation on the last line if words were left over.
  const used = out.join(" ").length;
  if (used < s.replace(/\s+/g, " ").trim().length && out.length) {
    out[out.length - 1] = clip(out[out.length - 1] + "..", max);
  }
  return out;
}

/** QR as BAR commands (horizontal runs of dark modules), inside a square of `size` dots. */
export function qrBars(value: string, x: number, y: number, size: number): string[] {
  const m = qrMatrix(value);
  const n = m.length;
  const cell = Math.max(1, Math.floor(size / (n + QR_QUIET_ZONE_MODULES * 2)));
  const drawn = cell * n;
  const ox = x + Math.floor((size - drawn) / 2);
  const oy = y + Math.floor((size - drawn) / 2);
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c++; continue; }
      const start = c;
      while (c < n && m[r][c]) c++;
      out.push(`BAR ${ox + start * cell},${oy + r * cell},${(c - start) * cell},${cell}`);
    }
  }
  return out;
}

/** Commands for one 2in × 1in sticker whose left edge is at `xo` dots. */
export function stickerCommands(lab: PdfLabel, xo: number, dpmm: 8 | 12): string[] {
  const dpi = dpmm === 12 ? 300 : 203;
  const W = Math.round(STICKER_IN.w * dpi);
  const H = Math.round(STICKER_IN.h * dpi);
  const pad = Math.round(0.06 * dpi);
  const qr = Math.round(0.75 * dpi);
  const tx = xo + pad + qr + Math.round(0.08 * dpi);
  const textW = xo + W - pad - tx;
  const f = FONTS[dpmm];
  const chars = (font: "1" | "2" | "3") => Math.floor(textW / f[font].w);
  const T = (y: number, font: "1" | "2" | "3", s: string) => `TEXT ${tx},${y},"${font}",0,1,1,"${s}"`;

  const out = qrBars(lab.qrValue, xo + pad, Math.round((H - qr) / 2), qr);
  const isBox = Boolean(lab.boxLine);
  let y = Math.round((isBox ? 0.07 : 0.1) * dpi);
  const gap = Math.round(0.03 * dpi);

  if (lab.showName && lab.name) {
    const lines = wrapText(tsplSafe(lab.name), chars("2"), isBox ? 1 : 2);
    for (const ln of lines) { out.push(T(y, "2", ln)); y += f["2"].h + Math.round(gap / 2); }
    y += gap;
  }
  if (lab.showSku) {
    out.push(T(y, "1", clip(tsplSafe("SKU " + lab.sku), chars("1"))));
    y += f["1"].h + gap;
  }
  if (lab.priceLine) {
    const p = tsplSafe(lab.priceLine);
    // Price code is what staff read at a glance: big font when it fits, else the medium one.
    const font: "2" | "3" = p.length <= chars("3") ? "3" : "2";
    if (y + f[font].h <= H - pad) out.push(T(y, font, clip(p, chars(font))));
    y += f[font].h + gap;
  }
  if (lab.boxLine) {
    const by = Math.min(y, H - pad - f["1"].h);
    out.push(T(by, "1", clip(tsplSafe(lab.boxLine), chars("1"))));
  }
  return out;
}

/** Full TSPL job for a batch of labels. Each PRINT is one physical row of the roll. */
export function buildTsplJob(labels: PdfLabel[], opts: TsplOptions = DEFAULT_TSPL): string {
  const { dpmm, layout } = opts;
  const perRow = layout === "2up" ? 2 : 1;
  const dpi = dpmm === 12 ? 300 : 203;
  const stickerDots = Math.round(STICKER_IN.w * dpi);
  const widthMm = (STICKER_IN.w * perRow * IN_MM).toFixed(1);
  const heightMm = (STICKER_IN.h * IN_MM).toFixed(1);
  const head = [
    `SIZE ${widthMm} mm,${heightMm} mm`,
    `GAP ${opts.gapMm ?? 2} mm,0 mm`,
    `DENSITY ${Math.max(0, Math.min(15, opts.density ?? 10))}`,
    "SPEED 4",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "SET TEAR ON",
  ];
  const body: string[] = [];
  for (let i = 0; i < labels.length; i += perRow) {
    body.push("CLS");
    for (let j = 0; j < perRow; j++) {
      const lab = labels[i + j];
      if (lab) body.push(...stickerCommands(lab, j * stickerDots, dpmm));
    }
    body.push("PRINT 1,1");
  }
  return [...head, ...body].join("\r\n") + "\r\n";
}

/** A recognisable test sticker for the printer settings screen. */
export function testLabel(): PdfLabel {
  return {
    name: "Aggarwal Jewellers test",
    sku: "TEST-001",
    qrValue: "https://aggarwaljeweller.in",
    priceLine: "A12345",
    showName: true,
    showSku: true,
  };
}
