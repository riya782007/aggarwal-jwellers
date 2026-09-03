import { describe, expect, it } from "vitest";
import { skuCandidatesFromScan } from "../lib/scan";

describe("scanner SKU normalization", () => {
  it("keeps the literal scan and adds a dash-separated fallback for legacy labels", () => {
    expect(skuCandidatesFromScan(" K12 A78271305 ")).toEqual(["K12 A78271305", "K12-A78271305"]);
  });

  it("extracts encoded SKUs from existing product-page QR labels", () => {
    expect(skuCandidatesFromScan("https://aggarwaljewellers.in/p/AJ1004%2FRED")).toEqual(["AJ1004/RED"]);
  });

  it("does not duplicate already normalized SKU values", () => {
    expect(skuCandidatesFromScan("AJ1004-RED")).toEqual(["AJ1004-RED"]);
  });
});
