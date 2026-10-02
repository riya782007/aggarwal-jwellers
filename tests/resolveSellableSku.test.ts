import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The counter's server backstop, run against an in-memory fake of the tables it reads — proves a
 * scan resolves in the documented order (exact → old SKU → separator-blind) in few round trips.
 */
type Row = Record<string, any>;
const db: Record<string, Row[]> = { products: [], variants: [], sku_aliases: [] };
let queries = 0;

const likeToRegex = (pattern: string) => {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; }
    if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
};

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let limit = Infinity;
  let single = false;
  let select = "";
  const join = (r: Row): Row => {
    const out = { ...r };
    if (table === "variants" && /product:products/.test(select)) out.product = db.products.find((p) => p.id === r.product_id) ?? null;
    if (table === "sku_aliases") {
      out.product = db.products.find((p) => p.id === r.product_id) ?? null;
      out.variant = db.variants.find((v) => v.id === r.variant_id) ?? null;
    }
    return out;
  };
  const q: any = {
    select(s: string) { select = s; return q; },
    ilike(col: string, pat: string) { const re = likeToRegex(pat); filters.push((r) => re.test(String(r[col] ?? ""))); return q; },
    eq(col: string, v: any) { filters.push((r) => r[col] === v); return q; },
    in(col: string, vs: any[]) { filters.push((r) => vs.includes(r[col])); return q; },
    limit(n: number) { limit = n; return q; },
    maybeSingle() { single = true; return q; },
    then(res: (v: any) => void, rej: (e: any) => void) {
      queries++;
      const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit).map(join);
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
    },
  };
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth", () => ({ requirePerm: async () => true }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({ from }) }));
vi.mock("@/lib/supabase/queries", () => ({
  getPricingFormula: async () => ({ retail_multiplier: 2, mrp_multiplier: 3, wholesale_multiplier: 1.2 }),
}));

const { resolveSellableSku } = await import("../app/actions/billing");

beforeEach(() => {
  queries = 0;
  db.products = [
    { id: "p1", sku: "AJDH1931", name: "Dhwani Earrings", base_wholesale: 10000, qty: 24 },
    { id: "p2", sku: "A3SAJNI13124MHWT", name: "Stone Bangle", base_wholesale: 20000, qty: 0 },
    { id: "p3", sku: "AJSIGDE542", name: "Signature Set", base_wholesale: 30000, qty: 0 },
    { id: "p4", sku: "KP-12-3", name: "Kundan A", base_wholesale: 5000, qty: 1 },
    { id: "p5", sku: "KP-1-23", name: "Kundan B", base_wholesale: 5000, qty: 1 },
  ];
  db.variants = [
    { id: "v1", product_id: "p2", sku: "A3SAJNI13124MHWT-210", size: "2.10", qty: 6 },
    { id: "v2", product_id: "p2", sku: "A3SAJNI13124MHWT-28", size: "2.8", qty: 4 },
    { id: "v3", product_id: "p3", sku: "AJSIGDE542-RED", color: "Red", qty: 3 },
  ];
  db.sku_aliases = [{ alias: "AJ1000-RED", product_id: "p3", variant_id: "v3" }];
});

describe("resolveSellableSku (server backstop for scans)", () => {
  it("finds an exact SKU, case-insensitively, in one parallel round", async () => {
    const r = await resolveSellableSku("ajdh1931");
    expect(r.item?.sku).toBe("AJDH1931");
    expect(r.via).toBe("exact");
    expect(r.item?.qty).toBe(24);
  });

  it("names the size of a variant line", async () => {
    const r = await resolveSellableSku("A3SAJNI13124MHWT-210");
    expect(r.item?.name).toBe("Stone Bangle · 2.10");
  });

  it("bills a sticker printed before the SKU was renamed", async () => {
    const r = await resolveSellableSku("AJ1000-RED");
    expect(r.via).toBe("alias");
    expect(r.item?.sku).toBe("AJSIGDE542-RED");
    expect(r.item?.name).toBe("Signature Set · Red");
  });

  it("matches a sticker whose separators differ, only when exactly one item fits", async () => {
    const r = await resolveSellableSku("A3SAJNI13124MHWT-2.10");
    expect(r).toMatchObject({ via: "canonical", item: { sku: "A3SAJNI13124MHWT-210" } });
  });

  it("refuses to guess between two items and offers both", async () => {
    const r = await resolveSellableSku("KP 123");
    expect(r.item).toBeNull();
    expect(r.suggestions).toEqual(expect.arrayContaining(["KP-12-3", "KP-1-23"]));
  });

  it("offers the same design's sizes when nothing fits", async () => {
    const r = await resolveSellableSku("A3SAJNI13124MHWT-2.6");
    expect(r.item).toBeNull();
    expect(r.suggestions).toEqual(expect.arrayContaining(["A3SAJNI13124MHWT-210", "A3SAJNI13124MHWT-28"]));
  });

  it("does not chain dozens of sequential queries on a miss", async () => {
    await resolveSellableSku("ZZ9999-NOPE");
    expect(queries).toBeLessThanOrEqual(20);
  });
});

describe("legacy /p/<sku> URL stickers in the fallbacks", () => {
  it("runs the separator-blind match on the SKU inside the URL", async () => {
    const r = await resolveSellableSku("https://aggarwaljewellers.in/p/A3SAJNI13124MHWT-2.10");
    expect(r).toMatchObject({ via: "canonical", item: { sku: "A3SAJNI13124MHWT-210" } });
  });
  it("suggests the design's SKUs, not URL noise", async () => {
    const r = await resolveSellableSku("https://aggarwaljewellers.in/p/A3SAJNI13124MHWT-2.6");
    expect(r.suggestions).toEqual(expect.arrayContaining(["A3SAJNI13124MHWT-210", "A3SAJNI13124MHWT-28"]));
  });
});
