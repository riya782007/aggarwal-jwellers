import { describe, it, expect } from "vitest";
import { encodeQr, qrToSvg, rsEncode, formatBits } from "@/lib/qr";

describe("QR — Reed–Solomon (gold vectors)", () => {
  it("matches the canonical HELLO WORLD v1-Q error-correction codewords", () => {
    // Published worked example: 13 data codewords -> 13 ECC codewords.
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
    const gold = [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16];
    expect(rsEncode(data, 13)).toEqual(gold);
  });
  it("format-info BCH for ECC level M, mask 0 is 0x5412", () => {
    expect(formatBits("M", 0)).toBe(0x5412);
  });
});

describe("QR — encoder structure", () => {
  it("HELLO WORLD is version 1 (21×21)", () => {
    const q = encodeQr("HELLO WORLD");
    expect(q.version).toBe(1);
    expect(q.size).toBe(21);
  });
  it("places the three finder patterns and timing/dark modules", () => {
    const { modules: m, size } = encodeQr("HELLO WORLD");
    // finder ring (top-left)
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true);
    expect([2, 3, 4].every((r) => [2, 3, 4].every((c) => m[r][c]))).toBe(true);
    // separator and timing
    expect([0, 1, 2, 3, 4, 5].every((c) => m[7][c] === false)).toBe(true);
    expect(m[6][8]).toBe(true);
    expect(m[6][9]).toBe(false);
    // dark module
    expect(m[size - 8][8]).toBe(true);
  });
  it("encodes a short SKU at v1 and a product link at a higher version", () => {
    expect(encodeQr("AJ1004").version).toBe(1);
    expect(encodeQr("https://aggarwaljewellers.in/catalog?q=AJ1004").version).toBeGreaterThan(1);
  });
  it("is deterministic", () => {
    expect(encodeQr("AJ1004").modules).toEqual(encodeQr("AJ1004").modules);
  });
  it("rejects a payload too large for v1–6", () => {
    expect(() => encodeQr("X".repeat(200))).toThrow();
  });
  it("qrToSvg returns a self-contained SVG with module rects", () => {
    const svg = qrToSvg("AJ1004");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
  });
});
