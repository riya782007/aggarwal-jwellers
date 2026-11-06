import { describe, it, expect } from "vitest";
import { computePrices, DEFAULT_FORMULA, followWholesale, pricesForWholesale } from "@/lib/pricing";

const F = DEFAULT_FORMULA;
const R = (n: number) => n * 100;

describe("retail/MRP follow a corrected wholesale rate", () => {
  it("prices a wholesale rate exactly as the formula prices the cost that produces it", () => {
    for (const base of [R(400), R(1250), R(1815), R(1895), R(4200)]) {
      const c = computePrices(base, F);
      const f = pricesForWholesale(c.wholesaleRate, F);
      expect(f.retail).toBe(c.retailPrice);
      expect(f.mrp).toBe(c.mrp);
    }
  });

  it("owner's case: wholesale 1815 → 1895 with retail on auto — retail moves up with it", () => {
    const before = computePrices(R(1815), F);
    const out = followWholesale({ wholesale: null, retail: null, mrp: null }, { wholesale: R(1895), retail: null, mrp: null }, F);
    expect(out.wholesale).toBe(R(1895));
    expect(out.retail).toBe(pricesForWholesale(R(1895), F).retail);
    expect(out.retail!).toBeGreaterThan(before.retailPrice);
  });

  it("a retail typed by hand in the same save is kept", () => {
    const out = followWholesale({ wholesale: R(1815), retail: R(2720), mrp: null }, { wholesale: R(1895), retail: R(2999), mrp: null }, F);
    expect(out.retail).toBe(R(2999));
  });

  it("an old pinned retail that the user didn't touch follows the new wholesale", () => {
    const out = followWholesale({ wholesale: R(1815), retail: R(2720), mrp: R(3630) }, { wholesale: R(1895), retail: R(2720), mrp: R(3630) }, F);
    expect(out.retail).toBe(pricesForWholesale(R(1895), F).retail);
    expect(out.mrp).toBe(pricesForWholesale(R(1895), F).mrp);
  });

  it("no wholesale change (or wholesale cleared) → nothing is altered", () => {
    const same = { wholesale: R(1895), retail: R(2500), mrp: null };
    expect(followWholesale(same, same, F)).toEqual(same);
    const cleared = { wholesale: null, retail: R(2500), mrp: null };
    expect(followWholesale({ wholesale: R(1895), retail: R(2500), mrp: null }, cleared, F)).toEqual(cleared);
  });

  it("Pricing tab: wholesale already pinned with retail on auto — pressing Save fixes retail (fillBlank)", () => {
    const stuck = { wholesale: R(1895), retail: null, mrp: null }; // the counter's product today
    expect(followWholesale(stuck, stuck, F)).toEqual(stuck); // other screens: untouched
    const fixed = followWholesale(stuck, stuck, F, { fillBlank: true });
    expect(fixed.retail).toBe(pricesForWholesale(R(1895), F).retail);
    expect(fixed.mrp).toBe(pricesForWholesale(R(1895), F).mrp);
    // …but a retail the owner typed is never replaced
    expect(followWholesale(stuck, { ...stuck, retail: R(2999) }, F, { fillBlank: true }).retail).toBe(R(2999));
  });
});
