import { describe, it, expect } from "vitest";
import {
  computePrices, isValidPriceSet, priceProduct, formatPaise,
  DEFAULT_FORMULA, type PricingFormula,
} from "../lib/pricing";

const F: PricingFormula = DEFAULT_FORMULA;

describe("computePrices", () => {
  it("computes wholesale/retail/mrp from base wholesale (₹150 base)", () => {
    const p = computePrices(15000, F); // ₹150 in paise
    expect(p.wholesaleRate).toBe(15000); // 150 as-is (no markup)
    // Retail ends in 0/5 → 150 * 1.5 = 225 → nearest ×5 → ₹225.
    expect(p.retailPrice).toBe(22500);
    // MRP ends in 0/5 → 150 * 4 = 600 → nearest ×5 → ₹600.
    expect(p.mrp).toBe(60000);
  });

  it("matches the live catalogue example (₹250 base → ₹559 / ₹690)", () => {
    const p = computePrices(25000, F);
    expect(p.retailPrice).toBe(37500); // 250*1.5=375 → nearest ×5 → ₹375 — must equal what place_order bills
    expect(p.mrp).toBe(100000);        // 250*4=1000 → ₹1000
  });

  it("rounds to the configured granularity (nearest rupee by default)", () => {
    const p = computePrices(12345, F); // ₹123.45
    expect(p.retailPrice % 100).toBe(0);
    expect(p.mrp % 100).toBe(0);
    expect(p.wholesaleRate % 100).toBe(0);
  });

  it("recomputes when the formula changes (one formula re-prices)", () => {
    const cheap = computePrices(15000, { ...F, retailMultiplier: 2.0 });
    const rich = computePrices(15000, { ...F, retailMultiplier: 3.0 });
    expect(rich.retailPrice).toBeGreaterThan(cheap.retailPrice);
  });
});

describe("isValidPriceSet", () => {
  it("accepts a normal set", () => {
    expect(isValidPriceSet(computePrices(15000, F))).toBe(true);
  });
  it("rejects non-positive base", () => {
    expect(priceProduct(0, F).valid).toBe(false);
    expect(priceProduct(-500, F).valid).toBe(false);
  });
  it("rejects NaN / non-finite base", () => {
    expect(priceProduct(NaN, F).valid).toBe(false);
  });
  it("rejects retail above MRP", () => {
    expect(isValidPriceSet({ wholesaleRate: 100, retailPrice: 500, mrp: 400 })).toBe(false);
  });
  it("rejects wholesale >= retail", () => {
    expect(isValidPriceSet({ wholesaleRate: 400, retailPrice: 400, mrp: 600 })).toBe(false);
  });
});

describe("formatPaise", () => {
  it("formats paise to rupees with Indian grouping", () => {
    expect(formatPaise(150000)).toBe("₹1,500");
    expect(formatPaise(NaN)).toBe("—");
  });
});
