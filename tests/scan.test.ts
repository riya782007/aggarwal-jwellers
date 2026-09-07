import { describe, expect, it } from "vitest";
import { skuCandidatesFromScan, looksLikeSkuScan, normalizeScanPayload } from "../lib/scan";

describe("scanner SKU normalization", () => {
  it("keeps the literal scan and adds a dash-separated fallback for legacy labels", () => {
    const c = skuCandidatesFromScan(" K12 A78271305 ");
    expect(c[0]).toBe("K12 A78271305");
    expect(c).toContain("K12-A78271305");
  });

  it("extracts encoded SKUs from existing product-page QR labels", () => {
    expect(skuCandidatesFromScan("https://aggarwaljewellers.in/p/AJ1004%2FRED")).toEqual(
      expect.arrayContaining(["AJ1004/RED"]),
    );
    expect(skuCandidatesFromScan("https://aggarwaljewellers.in/p/AJ1004%2FRED")[0]).toBe("AJ1004/RED");
  });

  it("does not lose an already normalized SKU value", () => {
    expect(skuCandidatesFromScan("AJ1004-RED")[0]).toBe("AJ1004-RED");
  });

  it("strips Code-39 asterisk wrappers and control characters from wedge scanners", () => {
    expect(normalizeScanPayload("\u0002*AJ1004-RED*\r")).toBe("AJ1004-RED");
    expect(skuCandidatesFromScan("*AJ1004-RED*")[0]).toBe("AJ1004-RED");
  });

  it("treats compact alphanumeric payloads as SKU scans, not name search", () => {
    expect(looksLikeSkuScan("AJ1004-RED")).toBe(true);
    expect(looksLikeSkuScan("kundan necklace")).toBe(false);
  });
});
