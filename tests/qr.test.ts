import { describe, it, expect } from "vitest";
import { qrMatrix, qrPath } from "../lib/qr";

/** Structural invariants of the QR symbol — the full decode path was additionally
 *  verified against an independent reader (jsQR) during development. */
describe("qr encoder", () => {
  it("picks version 1 (21×21) for a short SKU", () => {
    const m = qrMatrix("AJ1004");
    expect(m.length).toBe(21);
    expect(m.every((row) => row.length === 21)).toBe(true);
  });

  it("scales to higher versions for longer payloads", () => {
    expect(qrMatrix("https://aggarwaljewellers.in/p/AJ1042").length).toBe(29); // v3
    expect(qrMatrix("x".repeat(80)).length).toBe(37); // v5
  });

  it("rejects payloads beyond v5 capacity", () => {
    expect(() => qrMatrix("x".repeat(85))).toThrow();
  });

  it("draws the three finder patterns", () => {
    const m = qrMatrix("AJ1004");
    const n = m.length;
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      // outer ring dark, inner 3×3 dark, ring between light
      expect(m[r0][c0]).toBe(true);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
      expect(m[r0 + 1][c0 + 1]).toBe(false);
    }
  });

  it("has an alternating timing pattern", () => {
    const m = qrMatrix("AJ1004");
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("is deterministic and emits an SVG path", () => {
    const a = qrMatrix("AJ1004-RED");
    const b = qrMatrix("AJ1004-RED");
    expect(a).toEqual(b);
    const { d, size } = qrPath(a);
    expect(size).toBe(a.length);
    expect(d).toContain("h1v1h-1z");
  });
});
