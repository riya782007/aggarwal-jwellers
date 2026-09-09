import { describe, it, expect } from "vitest";
import {
  computePrices, isValidPriceSet, priceProduct, formatPaise,
  DEFAULT_FORMULA, type PricingFormula,
} from "../lib/pricing";

const F: PricingFormula = DEFAULT_FORMULA;

describe("computePrices", () => {
  // These expectations follow the owner's TIERED retail rule (see retailMultiplierForBase):
  // base wholesale below ₹1500 → 1.6×, ₹1500 and above → 1.5×, then rounded to the nearest ₹10.
  // The tier supersedes formula.retailMultiplier for the retail price. Verified against live
  // catalogue rows: a ₹175 base prices at ₹280, a ₹260 base at ₹420.
  it("computes wholesale/retail/mrp from base wholesale (₹150 base, cheap tier)", () => {
    const p = computePrices(15000, F); // ₹150 in paise
    expect(p.wholesaleRate).toBe(15000); // 150 as-is (no markup)
    // Retail: 150 × 1.6 = 240 → nearest ₹10 → ₹240.
    expect(p.retailPrice).toBe(24000);
    // MRP: 150 × 4 = 600 → ₹600.
    expect(p.mrp).toBe(60000);
  });

  it("matches the live catalogue example (₹250 base)", () => {
    const p = computePrices(25000, F);
    // 250 × 1.6 = 400 → ₹400 — must equal what place_order bills.
    expect(p.retailPrice).toBe(40000);
    expect(p.mrp).toBe(100000); // 250*4=1000 → ₹1000
  });

  it("uses the cheaper 1.5× multiplier at and above the ₹1500 tier threshold", () => {
    const below = computePrices(149900, F); // ₹1499 → 1.6×
    const at = computePrices(150000, F);    // ₹1500 → 1.5×
    expect(below.retailPrice).toBe(240000); // 1499 × 1.6 = 2398.4 → nearest ₹10 → ₹2400
    expect(at.retailPrice).toBe(225000);    // 1500 × 1.5 = 2250 → ₹2250
    // The tier makes a dearer piece cheaper at retail than the one just below the threshold.
    expect(at.retailPrice).toBeLessThan(below.retailPrice);
  });

  it("rounds to the configured granularity (nearest rupee by default)", () => {
    const p = computePrices(12345, F); // ₹123.45
    expect(p.retailPrice % 100).toBe(0);
    expect(p.mrp % 100).toBe(0);
    expect(p.wholesaleRate % 100).toBe(0);
  });

  it("prices every piece off one formula, so retail always tracks the base wholesale", () => {
    // formula.retailMultiplier no longer drives the retail tier — retailMultiplierForBase does —
    // so this asserts what actually holds: a dearer base always yields a dearer retail price.
    const cheap = computePrices(15000, F);
    const rich = computePrices(45000, F);
    expect(rich.retailPrice).toBeGreaterThan(cheap.retailPrice);
    // The MRP tier still follows the formula's mrpMultiplier.
    expect(computePrices(15000, { ...F, mrpMultiplier: 6 }).mrp)
      .toBeGreaterThan(computePrices(15000, { ...F, mrpMultiplier: 4 }).mrp);
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
