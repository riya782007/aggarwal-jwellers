import { describe, it, expect } from "vitest";
import { groupBillLines, OTHER_CATEGORY } from "@/lib/billGroups";

const line = (sku: string, cat: { name: string; sort?: number } | null, qty = 1, line_total = 1000) => ({
  qty, line_total, unit_price: line_total / qty,
  product: { name: sku, sku, category: cat },
});

const EAR = { name: "Earrings", sort: 2 };
const NECK = { name: "Necklace", sort: 1 };

describe("groupBillLines", () => {
  it("groups lines category-wise in catalogue order, A–Z by SKU inside each group", () => {
    const g = groupBillLines([
      line("E9", EAR), line("N5", NECK), line("E1", EAR), line("N2", NECK), line("X1", null),
    ]);
    expect(g.map((x) => x.category)).toEqual(["Necklace", "Earrings", OTHER_CATEGORY]);
    expect(g[0].items.map((i) => i.product.sku)).toEqual(["N2", "N5"]);
    expect(g[1].items.map((i) => i.product.sku)).toEqual(["E1", "E9"]);
    expect(g[2].items.map((i) => i.product.sku)).toEqual(["X1"]);
  });

  it("same sort number → categories A–Z; uncategorised always last", () => {
    const g = groupBillLines([line("A", null), line("B", { name: "Rings" }), line("C", { name: "Bangles" })]);
    expect(g.map((x) => x.category)).toEqual(["Bangles", "Rings", OTHER_CATEGORY]);
  });

  it("uses the variant SKU when present and never changes amounts or line count", () => {
    const ls = [
      { ...line("P1", EAR, 2, 5000), variant: { sku: "P1-RED" } },
      { ...line("P1", EAR, 3, 7500), variant: { sku: "P1-BLUE" } },
    ];
    const g = groupBillLines(ls);
    expect(g[0].items.map((i: any) => i.variant.sku)).toEqual(["P1-BLUE", "P1-RED"]);
    const flat = g.flatMap((x) => x.items);
    expect(flat.length).toBe(2);
    expect(flat.reduce((s, i) => s + i.line_total, 0)).toBe(12500);
  });

  it("accepts a category returned as an array (PostgREST embed shape)", () => {
    const g = groupBillLines([{ qty: 1, product: { sku: "Z", category: [{ name: "Chains", sort: 0 }] } }]);
    expect(g[0].category).toBe("Chains");
  });

  it("an old bill with no category data prints as one group (no headers needed)", () => {
    const g = groupBillLines([line("B", null), line("A", null)]);
    expect(g).toHaveLength(1);
    expect(g[0].category).toBe(OTHER_CATEGORY);
    expect(g[0].items.map((i) => i.product.sku)).toEqual(["A", "B"]);
  });

  it("inside a category, lines run by price — lowest rate first (owner request)", () => {
    const g = groupBillLines([
      line("N1", NECK, 1, 90000), line("E2", EAR, 2, 50000), line("N9", NECK, 1, 12000),
      line("E1", EAR, 6, 48000), line("N5", NECK, 2, 60000),
    ]);
    expect(g.map((x) => x.category)).toEqual(["Necklace", "Earrings"]);
    // Necklace rates: N9 ₹120, N5 ₹300, N1 ₹900
    expect(g[0].items.map((i) => i.product.sku)).toEqual(["N9", "N5", "N1"]);
    // Earrings rates: E1 ₹80, E2 ₹250
    expect(g[1].items.map((i) => i.product.sku)).toEqual(["E1", "E2"]);
  });

  it("equal prices fall back to A–Z by SKU; a missing price never breaks the order", () => {
    const g = groupBillLines([
      line("B2", EAR, 1, 5000), line("B1", EAR, 1, 5000),
      { qty: 1, line_total: 0, unit_price: undefined, product: { sku: "Z9", category: EAR } } as any,
    ]);
    expect(g[0].items.map((i: any) => i.product.sku)).toEqual(["Z9", "B1", "B2"]);
  });
});
