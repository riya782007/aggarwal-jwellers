import { describe, it, expect } from "vitest";
import { formatBoxLabelLine, thermalTextBox, THERMAL_LABEL } from "../lib/boxLabel";

describe("formatBoxLabelLine", () => {
  it("does not prefix GRP when the stored code already starts with GRP-", () => {
    expect(formatBoxLabelLine("GRP-JS3JA8", 1)).toBe("GRP-JS3JA8 · BOX 1");
  });

  it("prints pack quantity without a second GRP token", () => {
    expect(formatBoxLabelLine("GRP-JS3JA8", 6)).toBe("GRP-JS3JA8 · BOX 6");
    expect(formatBoxLabelLine("GRP-JS3JA8", 6)).not.toMatch(/GRP\s+GRP/i);
  });

  it("strips an accidental extra GRP prefix", () => {
    expect(formatBoxLabelLine("GRP GRP-JS3JA8", 1)).toBe("GRP-JS3JA8 · BOX 1");
    expect(formatBoxLabelLine("GRP-GRP-JS3JA8", 1)).toBe("GRP-JS3JA8 · BOX 1");
  });

  it("floors invalid pack quantities to 1", () => {
    expect(formatBoxLabelLine("GRP-JS3JA8", 0)).toBe("GRP-JS3JA8 · BOX 1");
    expect(formatBoxLabelLine("GRP-JS3JA8", -4)).toBe("GRP-JS3JA8 · BOX 1");
  });

  it("stays short enough for the 2in text column at 5.5pt", () => {
    // Helvetica ≈ 0.5em per glyph. 5.5pt × 0.5 × chars must be < 70pt text column.
    const line = formatBoxLabelLine("GRP-JS3JA8", 12);
    expect(line.length).toBeLessThanOrEqual(22);
  });
});

describe("thermal sticker bounds", () => {
  it("keeps each slot's text inside its own 2in × 1in sticker", () => {
    for (const slot of [0, 1]) {
      const { xoff, tx, maxW } = thermalTextBox(slot);
      expect(maxW).toBeGreaterThan(0);
      expect(tx).toBeGreaterThanOrEqual(xoff + THERMAL_LABEL.pad + THERMAL_LABEL.qr);
      expect(tx + maxW).toBeLessThanOrEqual(xoff + THERMAL_LABEL.half - THERMAL_LABEL.pad + 1e-6);
      expect(xoff + THERMAL_LABEL.half).toBeLessThanOrEqual(THERMAL_LABEL.pageW);
    }
  });

  it("does not let the left sticker's text reach the right sticker's QR", () => {
    const left = thermalTextBox(0);
    const rightQrLeft = THERMAL_LABEL.half + THERMAL_LABEL.pad;
    expect(left.tx + left.maxW).toBeLessThan(rightQrLeft);
  });

  it("keeps the last baseline inside the 1in height", () => {
    expect(THERMAL_LABEL.maxBaseline).toBeLessThan(THERMAL_LABEL.pageH);
  });
});
