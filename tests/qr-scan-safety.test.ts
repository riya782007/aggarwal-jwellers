import { describe, it, expect } from "vitest";
import { qrMatrix } from "../lib/qr";
import { qrLayout, thermalTextBox, QR_SIZING, QR_QUIET_MODULES, THERMAL_LABEL } from "../lib/boxLabel";

/**
 * A sticker scans or doesn't because of its MODULE size — the width of one black square — not
 * because of how big the QR looks. The renderer used to squeeze every QR into one fixed 54pt box,
 * so module size depended on how long the SKU was:
 *
 *   11-char SKU  -> 21 modules -> 0.657mm modules
 *   21-char SKU  -> 25 modules -> 0.577mm
 *   40-char SKU  -> 33 modules -> 0.465mm   (silently, with no warning)
 *
 * Measured against the live catalogue, payloads run 3-25 characters, so both sizes are in use
 * today — which is exactly the variation the owner noticed on the printed rolls.
 *
 * Module size is now constant and the square grows instead. These tests hold that line: every
 * payload the shop can produce must print at or above the floor, and anything that cannot must
 * be refused rather than printed unscannable.
 */

const PT_TO_MM = 0.3528;
const mm = (pt: number) => pt * PT_TO_MM;

/** Live catalogue payload lengths (max seen: product SKU 25, variant SKU 21, box code 15). */
const REAL_PAYLOADS = [
  "AJ1",                        // shortest product SKU seen (3)
  "NSSCNNP4806",                // typical product SKU (11)
  "GRP-QCN4BB",                 // box code from a printed sticker (10)
  "GRP-QLW4TN",                 // box code from a printed sticker (10)
  "NSRJHHN1560-RED",            // variant SKU (15)
  "PACIFIC-B1162-GOLD-2",       // longer variant (20)
  "NSRJRAN1615-ROSEGOLD",       // 20
  "ABCDEFGHIJ1234567890XYZAB",  // 25 — the longest product SKU in the catalogue
];

describe("every payload the shop actually prints stays scannable", () => {
  it.each(REAL_PAYLOADS)("%s prints modules at or above the 0.5mm floor", (payload) => {
    const n = qrMatrix(payload).length;
    const { ok, modulePt } = qrLayout(n);
    expect(ok).toBe(true);
    expect(mm(modulePt)).toBeGreaterThanOrEqual(0.5);
  });

  it("prints the SAME module size for every real payload, short or long", () => {
    const sizes = new Set(REAL_PAYLOADS.map((p) => qrLayout(qrMatrix(p).length).modulePt.toFixed(6)));
    expect(sizes.size).toBe(1);
  });

  it("keeps the module comfortably above the floor, not just barely", () => {
    for (const p of REAL_PAYLOADS) {
      expect(mm(qrLayout(qrMatrix(p).length).modulePt)).toBeGreaterThanOrEqual(0.6);
    }
  });
});

describe("qrLayout", () => {
  it("uses the preferred module size while the QR still fits", () => {
    // 21 modules (version 1) and 25 (version 2) both fit at the target size.
    for (const n of [21, 25]) {
      expect(qrLayout(n).modulePt).toBeCloseTo(QR_SIZING.preferredModulePt, 9);
    }
  });

  it("shrinks the module only once the box cannot grow further, and never below the floor", () => {
    for (const n of [29, 33]) {
      const { ok, modulePt, boxPt } = qrLayout(n);
      expect(ok).toBe(true);
      expect(boxPt).toBeLessThanOrEqual(QR_SIZING.maxBoxPt);
      expect(modulePt).toBeGreaterThanOrEqual(QR_SIZING.minModulePt);
      expect(modulePt).toBeLessThan(QR_SIZING.preferredModulePt);
    }
  });

  it("refuses a QR too dense to scan instead of printing it", () => {
    // A very large matrix cannot reach the floor inside a 2in sticker.
    expect(qrLayout(200).ok).toBe(false);
  });

  it("always reserves the four-module quiet zone inside the box it reports", () => {
    for (const n of [21, 25, 29, 33]) {
      const { modulePt, boxPt } = qrLayout(n);
      expect(boxPt).toBeGreaterThanOrEqual((n + QR_QUIET_MODULES * 2) * modulePt - 1e-9);
    }
  });

  it("never returns a QR wider than the sticker's usable width", () => {
    const usable = THERMAL_LABEL.half - THERMAL_LABEL.pad * 2;
    for (const n of [21, 25, 29, 33]) expect(qrLayout(n).boxPt).toBeLessThanOrEqual(usable);
  });
});

describe("the text block still fits beside a QR that grew", () => {
  it.each([0, 1])("slot %i keeps text inside its own 2in sticker at every QR size", (slot) => {
    for (const n of [21, 25, 29, 33]) {
      const { boxPt } = qrLayout(n);
      const { xoff, tx, maxW } = thermalTextBox(slot, boxPt);
      // Text starts after the QR and never crosses into the neighbouring sticker.
      expect(tx).toBeGreaterThanOrEqual(xoff + THERMAL_LABEL.pad + boxPt);
      expect(tx + maxW).toBeLessThanOrEqual(xoff + THERMAL_LABEL.half - THERMAL_LABEL.pad + 1e-6);
      expect(maxW).toBeGreaterThan(0);
    }
  });

  it("leaves usable room for the price code even at the largest QR", () => {
    const { boxPt } = qrLayout(33);
    // The price code (e.g. A75007100051) needs room at ~9pt; 40pt is a workable floor.
    expect(thermalTextBox(0, boxPt).maxW).toBeGreaterThan(40);
  });

  it("defaults to the old geometry when no QR width is passed", () => {
    expect(thermalTextBox(0)).toEqual(thermalTextBox(0, THERMAL_LABEL.qr));
  });
});

describe("what the printed sticker guarantees", () => {
  it("a 203dpi thermal head gets at least 4 dots per module", () => {
    const dotMm = 25.4 / 203;
    for (const p of REAL_PAYLOADS) {
      const dots = mm(qrLayout(qrMatrix(p).length).modulePt) / dotMm;
      expect(dots).toBeGreaterThanOrEqual(4);
    }
  });

  it("the QR always fits the 1in sticker height", () => {
    for (const n of [21, 25, 29, 33]) {
      expect(qrLayout(n).boxPt).toBeLessThanOrEqual(THERMAL_LABEL.pageH);
    }
  });
});
