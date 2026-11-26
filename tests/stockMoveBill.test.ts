import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({}) }));
const { stockMoveOrderId } = await import("@/lib/supabase/queries");

const ID = "0d5597ef-6a78-4b1c-ab74-cea792d0ebe1";
describe("stock movement → the bill it came from", () => {
  it("billing-screen sales (bill id only in the text, as on the owner's screen)", () => {
    expect(stockMoveOrderId({ kind: "sale", source: `order ${ID}`, ref_id: null })).toBe(ID);
  });
  it("website wholesale orders", () => {
    expect(stockMoveOrderId({ kind: "sale", source: `wholesale order ${ID}`, ref_id: null })).toBe(ID);
  });
  it("bill edits and cancellations", () => {
    expect(stockMoveOrderId({ kind: "sale", source: `order ${ID} (bill edited)`, ref_id: ID })).toBe(ID);
    expect(stockMoveOrderId({ kind: "cancel", source: `order ${ID} cancelled`, ref_id: ID })).toBe(ID);
  });
  it("uses ref_id when the movement has it", () => {
    expect(stockMoveOrderId({ kind: "sale", source: "Sale", ref_id: ID })).toBe(ID);
  });
  it("purchases, opening stock and manual adjustments don't point at a bill", () => {
    expect(stockMoveOrderId({ kind: "purchase", source: `order ${ID}`, ref_id: ID })).toBeNull();
    expect(stockMoveOrderId({ kind: "opening", source: "create", ref_id: null })).toBeNull();
    expect(stockMoveOrderId({ kind: "adjust", source: "Stock count", ref_id: null })).toBeNull();
  });
});
