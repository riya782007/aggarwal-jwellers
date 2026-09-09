import { describe, it, expect } from "vitest";
import { formatPriceCode, priceCodeFromPaise, rupeesFromPaise } from "../lib/priceCode";

/**
 * These lock the printed price code. A drift here puts a wrong price on a physical jewellery
 * sticker, so the cases below mirror exactly what the three old inline copies produced.
 */
describe("formatPriceCode", () => {
  it("matches the owner's documented example (wholesale 500, retail 1000)", () => {
    expect(formatPriceCode("500", "1000")).toBe("A75007100051");
    expect(formatPriceCode(500, 1000)).toBe("A75007100051");
  });

  it("omits the 7·x·7 block when wholesale is absent or zero", () => {
    expect(formatPriceCode("", "1000")).toBe("A100051");
    expect(formatPriceCode("0", "1000")).toBe("A100051");
    expect(formatPriceCode(0, 1000)).toBe("A100051");
  });

  it("keeps the wholesale block when only wholesale is known", () => {
    expect(formatPriceCode("500", "")).toBe("A7500751");
  });

  it("returns an empty string when neither price is usable", () => {
    expect(formatPriceCode("", "")).toBe("");
    expect(formatPriceCode(null, undefined)).toBe("");
    expect(formatPriceCode("0", "0")).toBe("");
  });

  it("drops decimals and stray characters the owner may type", () => {
    expect(formatPriceCode("500.75", "1000.20")).toBe("A75007100051");
    expect(formatPriceCode("₹500", "1,000")).toBe("A75007100051");
  });

  it("ignores negative and non-finite amounts", () => {
    expect(formatPriceCode(-500, 1000)).toBe("A100051");
    expect(formatPriceCode(Number.NaN, 1000)).toBe("A100051");
  });
});

describe("rupeesFromPaise", () => {
  it("converts stored paise to whole rupees", () => {
    expect(rupeesFromPaise(50000)).toBe("500");
    expect(rupeesFromPaise(47025)).toBe("470"); // rounds to the nearest rupee
  });

  it("treats missing, zero and negative amounts as absent", () => {
    expect(rupeesFromPaise(0)).toBe("");
    expect(rupeesFromPaise(-100)).toBe("");
    expect(rupeesFromPaise(null)).toBe("");
    expect(rupeesFromPaise(undefined)).toBe("");
  });
});

describe("priceCodeFromPaise", () => {
  it("builds the same code straight from paise", () => {
    expect(priceCodeFromPaise(50000, 100000)).toBe("A75007100051");
  });

  it("returns an empty string when the item has no prices", () => {
    expect(priceCodeFromPaise(0, 0)).toBe("");
    expect(priceCodeFromPaise(null, null)).toBe("");
  });
});
