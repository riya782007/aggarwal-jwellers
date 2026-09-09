import { describe, it, expect } from "vitest";
import { DIVA_NAMES, availableDivaNames, pickDivaName } from "../lib/content";

/**
 * The catalogue ended up with one name ("Ananya") on 165 of 379 titled products, and 68% of all
 * titles starting with one of ten hardcoded names. Three causes: a name pool far smaller than the
 * catalogue, pickers that ignored which names were already taken, and a fixed set of example
 * names in the prompt that the model copied. These lock the first two.
 */

describe("DIVA_NAMES pool", () => {
  it("has no duplicates (case-insensitively)", () => {
    const keys = DIVA_NAMES.map((n) => n.trim().toLowerCase());
    expect(new Set(keys).size).toBe(DIVA_NAMES.length);
  });

  it("is large enough that a growing catalogue keeps finding fresh names", () => {
    // The old 40-name pool guaranteed repeats almost immediately.
    expect(DIVA_NAMES.length).toBeGreaterThanOrEqual(100);
  });
});

describe("availableDivaNames", () => {
  it("never offers a name that is already used", () => {
    const reserved = ["Ananya", "Aaradhya", "Myra", "Vanya", "Khyati"];
    const offered = availableDivaNames(reserved, 30, "seed");
    for (const r of reserved) expect(offered).not.toContain(r);
  });

  it("ignores case and stray whitespace when matching used names", () => {
    const offered = availableDivaNames(["  ANANYA ", "myra"], 40, "x");
    expect(offered).not.toContain("Ananya");
    expect(offered).not.toContain("Myra");
  });

  it("offers different slices for different products, so the model is not always shown the same names", () => {
    const a = availableDivaNames([], 10, "SKU-A|Choker");
    const b = availableDivaNames([], 10, "SKU-B|Necklace");
    expect(a).not.toEqual(b);
  });

  it("is stable for the same product", () => {
    expect(availableDivaNames([], 10, "SKU-A")).toEqual(availableDivaNames([], 10, "SKU-A"));
  });

  it("still returns names when every name is taken, rather than nothing", () => {
    const offered = availableDivaNames(DIVA_NAMES, 5, "seed");
    expect(offered.length).toBe(5);
  });

  it("returns only real names from the pool", () => {
    for (const n of availableDivaNames(["Ananya"], 20, "s")) expect(DIVA_NAMES).toContain(n);
  });
});

describe("pickDivaName", () => {
  it("skips names already used in the catalogue", () => {
    const reserved = ["Ananya", "Dhyani", "Rutvika"];
    for (const seed of ["AJ1001", "AJ1002", "PACIFIC-B1162", "NSSCNNP4806"]) {
      expect(reserved).not.toContain(pickDivaName(seed, reserved));
    }
  });

  it("stays stable for the same product, so a fallback title does not churn", () => {
    expect(pickDivaName("AJ1001")).toBe(pickDivaName("AJ1001"));
  });

  it("spreads a batch of products across many names instead of collapsing onto a few", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `SKU${i}`);
    const distinct = new Set(seeds.map((s) => pickDivaName(s)));
    // The old 40-name pool capped this at 40 and clustered hard; require real spread.
    expect(distinct.size).toBeGreaterThan(50);
  });

  it("falls back to the full pool when everything is reserved", () => {
    expect(DIVA_NAMES).toContain(pickDivaName("AJ1001", DIVA_NAMES));
  });
});
