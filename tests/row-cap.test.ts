import { describe, it, expect } from "vitest";
import { allRows } from "../lib/pagination";

/**
 * PostgREST silently caps a plain select at 1000 rows — no error, no warning. The catalogue
 * passed 1000 products, so every read that must cover the WHOLE products table has to page
 * with allRows(); otherwise the newest SKUs (which sort last by `sku`) simply vanish from the
 * labels list, the estimate picker and purchase entry. These lock the pager's behaviour.
 */

/** Minimal stand-in for a PostgREST query builder: .range(from, to) resolves to a page. */
function fakeQuery(total: number, pageSize = 1000) {
  let calls = 0;
  const make = () => ({
    range: async (from: number, to: number) => {
      calls++;
      const rows = [];
      for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ sku: `SKU${String(i).padStart(5, "0")}` });
      return { data: rows, error: null };
    },
  });
  return { make, pageSize, calls: () => calls };
}

describe("allRows", () => {
  it("returns every row when the table is larger than one page", async () => {
    const q = fakeQuery(1105);
    const rows = await allRows<any>(q.make);
    expect(rows).toHaveLength(1105);
  });

  it("includes rows past the 1000-row cap — the ones that were disappearing", async () => {
    const rows = await allRows<any>(fakeQuery(1105).make);
    expect(rows[1000].sku).toBe("SKU01000");
    expect(rows[1104].sku).toBe("SKU01104");
  });

  it("stops after one request when the table fits in a single page", async () => {
    const q = fakeQuery(42);
    const rows = await allRows<any>(q.make);
    expect(rows).toHaveLength(42);
    expect(q.calls()).toBe(1);
  });

  it("handles an exact multiple of the page size without looping forever", async () => {
    const q = fakeQuery(2000);
    const rows = await allRows<any>(q.make);
    expect(rows).toHaveLength(2000);
    expect(q.calls()).toBe(3); // two full pages, then an empty one that ends the loop
  });

  it("returns an empty list when the query errors, so callers can fall back", async () => {
    const rows = await allRows<any>(() => ({
      range: async () => ({ data: null, error: { message: "column does not exist" } }),
    }));
    expect(rows).toEqual([]);
  });

  it("returns what it has when a later page errors rather than throwing", async () => {
    let n = 0;
    const rows = await allRows<any>(() => ({
      range: async (from: number) => {
        if (n++ > 0) return { data: null, error: { message: "timeout" } };
        return { data: Array.from({ length: 1000 }, (_, i) => ({ i: from + i })), error: null };
      },
    }));
    expect(rows).toHaveLength(1000);
  });
});
