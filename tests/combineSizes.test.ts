import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- tiny in-memory PostgREST stand-in (only the calls combineSizesAction makes) ----
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let uid = 0;
const nid = () => `id${++uid}`;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "delete" | "insert" = "select";
  let patch: Row | null = null;
  let insertRow: Row | null = null;
  const rows = () => (db[table] ??= []);
  const match = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === "update") { const m = match(); m.forEach((r) => Object.assign(r, patch)); return { data: m, error: null }; }
    if (op === "delete") { const m = new Set(match()); db[table] = rows().filter((r) => !m.has(r)); return { data: null, error: null }; }
    if (op === "insert") { const r = { id: nid(), ...insertRow }; rows().push(r); return { data: r, error: null }; }
    return { data: match().map((r) => ({ ...r })), error: null };
  };
  const q: any = {
    select: () => q,
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
    neq: (k: string, v: any) => { filters.push((r) => r[k] !== v); return q; },
    in: (k: string, vs: any[]) => { filters.push((r) => vs.includes(r[k])); return q; },
    update: (p: Row) => { op = "update"; patch = p; return q; },
    delete: () => { op = "delete"; return q; },
    insert: (r: Row) => { op = "insert"; insertRow = r; return q; },
    upsert: (r: Row) => { const ex = rows().find((x) => x.alias === r.alias); ex ? Object.assign(ex, r) : rows().push({ id: nid(), ...r }); return Promise.resolve({ error: null }); },
    maybeSingle: () => { const { data } = run(); return Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }); },
    single: () => Promise.resolve(run()),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({ from: (t: string) => query(t) }) }));
vi.mock("@/lib/auth", () => ({ requirePerm: async () => true }));
vi.mock("@/lib/audit", () => ({ logActivity: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/queries", () => ({ getColorCodeMap: async () => ({}), getPricingFormula: async () => ({}) }));
vi.mock("@/lib/ai/gemini", () => ({ generateImage: async () => null, geminiConfigured: () => false }));
vi.mock("@/lib/ai/imagePrompt", () => ({ buildVariantImagePrompt: () => "" }));

const { combineSizesAction } = await import("@/app/actions/variants");
const form = (sku: string) => { const f = new FormData(); f.set("product_sku", sku); return f; };

beforeEach(() => {
  uid = 0;
  // The owner's product: 6 sizes, 322 pcs. Sizes 24 + 26 are on past bills, 28 on a purchase,
  // size 30 has a box QR, sizes 32 + 34 were never used anywhere.
  const v = (id: string, sku: string, qty: number) => ({ id, product_id: "P1", sku, qty });
  db = {
    products: [{ id: "P1", sku: "PDD2.50M-RO", name: "2.50 MM 4PC AD CHURI RO", category_id: "C1", base_wholesale: 30000, type: "configurable", qty: 322 }],
    variants: [v("V24", "PDD2.50M-RO-24", 11), v("V26", "PDD2.50M-RO-26", 95), v("V28", "PDD2.50M-RO-28", 52), v("V30", "PDD2.50M-RO-30", 100), v("V32", "PDD2.50M-RO-32", 58), v("V34", "PDD2.50M-RO-34", 6)],
    order_items: [{ id: "o1", product_id: "P1", variant_id: "V24" }, { id: "o2", product_id: "P1", variant_id: "V26" }],
    purchase_items: [{ id: "pu1", product_id: "P1", variant_id: "V28" }],
    estimate_items: [],
    inventory_groups: [{ id: "g1", code: "GRP-X", product_id: "P1", variant_id: "V30", pack_qty: 12 }],
    sku_aliases: [{ id: "a0", alias: "OLDCODE", product_id: "P1", variant_id: "V26" }],
  };
});

describe("combineSizesAction — sizes into one item with a single QR", () => {
  it("one plain item with the whole stock", async () => {
    const r = await combineSizesAction(form("PDD2.50M-RO"));
    expect(r.ok).toBe(true);
    const p = db.products.find((x) => x.id === "P1")!;
    expect(p.type).toBe("simple");
    expect(p.qty).toBe(322);
    expect(db.variants.filter((x) => x.product_id === "P1")).toHaveLength(0); // no sizes left on it
  });

  it("sizes on bills/purchases are kept (0 stock) on a hidden archive; unused sizes are removed", async () => {
    await combineSizesAction(form("PDD2.50M-RO"));
    const arch = db.products.find((x) => x.sku === "PDD2.50M-RO-OLDSIZES")!;
    expect(arch).toBeTruthy();
    expect(arch.status).toBe("draft");
    const kept = db.variants.filter((x) => x.product_id === arch.id).map((x) => x.sku).sort();
    expect(kept).toEqual(["PDD2.50M-RO-24-OLD", "PDD2.50M-RO-26-OLD", "PDD2.50M-RO-28-OLD"]);
    expect(db.variants.every((x) => x.qty === 0)).toBe(true);
    // old bills still point at their (archived) size rows
    expect(db.order_items.map((o) => o.variant_id)).toEqual(["V24", "V26"]);
    expect(db.variants.find((x) => x.id === "V32")).toBeUndefined();
  });

  it("every old size sticker (and older aliases) now scans as the single item; box QR moves to it", async () => {
    await combineSizesAction(form("PDD2.50M-RO"));
    for (const s of ["24", "26", "28", "30", "32", "34"]) {
      const a = db.sku_aliases.find((x) => x.alias === `PDD2.50M-RO-${s}`)!;
      expect(a).toBeTruthy();
      expect(a.product_id).toBe("P1");
      expect(a.variant_id ?? null).toBeNull();
    }
    expect(db.sku_aliases.find((x) => x.alias === "OLDCODE")!.variant_id).toBeNull();
    expect(db.inventory_groups[0]).toMatchObject({ product_id: "P1", variant_id: null, pack_qty: 12 });
  });

  it("a product without sizes is left alone", async () => {
    await combineSizesAction(form("PDD2.50M-RO"));
    const again = await combineSizesAction(form("PDD2.50M-RO"));
    expect(again.ok).toBe(false);
    expect(db.products.find((x) => x.id === "P1")!.qty).toBe(322);
  });
});
