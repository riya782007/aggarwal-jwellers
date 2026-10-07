import { describe, it, expect } from "vitest";
import { planBillEdit, editGivesBack, type BillEditLine } from "@/lib/billEdit";

const saved = (): BillEditLine[] => [
  { itemId: "a", sku: "P1", name: "Ring", qty: 2, rate: 15000, origQty: 2, origRate: 15000 },
  { itemId: "b", sku: "P2-RED", name: "Necklace – Red", qty: 1, rate: 30000, origQty: 1, origRate: 30000 },
];

describe("planBillEdit", () => {
  it("no change → nothing to save", () => {
    const p = planBillEdit(saved(), 0, 60000, 60000);
    expect(p.changed).toBe(false);
    expect(p.newTotal).toBe(60000);
    expect(p.refund).toBe(0);
    expect(p.due).toBe(0);
  });

  it("adding an item raises the total and shows what is due", () => {
    const ls = [...saved(), { sku: "P2-BLUE", name: "Necklace – Blue", qty: 2, rate: 50000 }];
    const p = planBillEdit(ls, 0, 60000, 60000);
    expect(p.changed).toBe(true);
    expect(p.givesBack).toBe(false);
    expect(p.newTotal).toBe(160000);
    expect(p.due).toBe(100000);
    expect(p.payload).toEqual([
      { item_id: "a", qty: 2, unit_price: 15000 },
      { item_id: "b", qty: 1, unit_price: 30000 },
      { sku: "P2-BLUE", qty: 2, unit_price: 50000 },
    ]);
  });

  it("removing a paid item hands money back and is flagged as giving stock back", () => {
    const ls = saved(); ls[1].removed = true;
    const p = planBillEdit(ls, 0, 60000, 60000);
    expect(p.givesBack).toBe(true);
    expect(p.newTotal).toBe(30000);
    expect(p.refund).toBe(30000);
    expect(p.due).toBe(0);
    expect(p.payload).toEqual([{ item_id: "a", qty: 2, unit_price: 15000 }]);
  });

  it("lowering a quantity gives back; raising does not", () => {
    const down = saved(); down[0].qty = 1;
    expect(planBillEdit(down, 0, 60000, 60000).givesBack).toBe(true);
    const up = saved(); up[0].qty = 3;
    expect(planBillEdit(up, 0, 60000, 60000).givesBack).toBe(false);
  });

  it("keeps packing / courier / adjustment in the total", () => {
    const p = planBillEdit(saved(), 1500, 61500, 61500);
    expect(p.newTotal).toBe(61500);
    expect(p.changed).toBe(false);
  });

  it("refuses an empty bill, zero qty, negative rate and duplicate SKUs", () => {
    const empty = saved().map((l) => ({ ...l, removed: true }));
    expect(planBillEdit(empty, 0, 0, 60000).problem).toMatch(/cancel the bill/);
    const zero = saved(); zero[0].qty = 0;
    expect(planBillEdit(zero, 0, 0, 60000).problem).toMatch(/Quantity for P1/);
    const neg = saved(); neg[0].rate = -1;
    expect(planBillEdit(neg, 0, 0, 60000).problem).toMatch(/negative/);
    const dup = [...saved(), { sku: "p1", name: "Ring", qty: 1, rate: 15000 }];
    expect(planBillEdit(dup, 0, 0, 60000).problem).toMatch(/twice/);
  });

  it("partly paid bill: lowering below paid refunds only the excess", () => {
    const ls = saved(); ls[0].qty = 1; // total 450, paid 500
    const p = planBillEdit(ls, 0, 50000, 60000);
    expect(p.refund).toBe(5000);
    expect(p.due).toBe(0);
  });
});

describe("editGivesBack (server permission check)", () => {
  const cur = [{ id: "a", qty: 2 }, { id: "b", qty: 1 }];
  it("adding only → false", () => {
    expect(editGivesBack(cur, [{ item_id: "a", qty: 2 }, { item_id: "b", qty: 1 }, { qty: 3 }])).toBe(false);
    expect(editGivesBack(cur, [{ item_id: "a", qty: 5 }, { item_id: "b", qty: 1 }])).toBe(false);
  });
  it("removing or lowering → true", () => {
    expect(editGivesBack(cur, [{ item_id: "a", qty: 2 }])).toBe(true);
    expect(editGivesBack(cur, [{ item_id: "a", qty: 1 }, { item_id: "b", qty: 1 }])).toBe(true);
  });
});
