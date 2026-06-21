"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { computePrices, isValidPriceSet } from "@/lib/pricing";
import { getPricingFormula } from "@/lib/supabase/queries";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function createCategoryAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const sb = supabaseServer();
  await sb.from("categories").insert({ name, slug: slugify(name) });
  revalidatePath("/admin/categories");
  revalidatePath("/shop");
}

async function nextSku(sb: ReturnType<typeof supabaseServer>): Promise<number> {
  const { data } = await sb.from("products").select("sku");
  const max = Math.max(999, ...((data ?? []).map((r: any) => parseInt(String(r.sku).replace(/\D/g, ""), 10) || 0)));
  return max + 1;
}

export type NewProduct = { categoryId: string; name: string; basePriceRupees: number; qty: number; type: "simple" | "configurable"; colors: string[] };
export type RowResult = { row: number; ok: boolean; sku?: string; error?: string };

async function insertOne(sb: ReturnType<typeof supabaseServer>, formula: any, n: NewProduct, skuNum: number): Promise<RowResult> {
  if (!n.name) return { row: skuNum, ok: false, error: "Missing name" };
  if (!(n.basePriceRupees > 0)) return { row: skuNum, ok: false, error: "Base price must be > 0" };
  if (!n.categoryId) return { row: skuNum, ok: false, error: "Missing category" };
  const prices = computePrices(n.basePriceRupees * 100, formula);
  if (!isValidPriceSet(prices)) return { row: skuNum, ok: false, error: "Computed price invalid — flagged" };
  const sku = `BD${skuNum}`;
  const { data: prod, error } = await sb.from("products").insert({
    category_id: n.categoryId, sku, name: n.name, type: n.type,
    base_wholesale: n.basePriceRupees * 100, qty: Math.max(0, n.qty), status: "published", last_movement_at: new Date().toISOString(),
  }).select("id").single();
  if (error) return { row: skuNum, ok: false, error: error.message };
  if (n.type === "configurable" && n.colors.length) {
    await sb.from("variants").insert(n.colors.map((c, i) => ({
      product_id: prod!.id, color: c, sku: `${sku}-${c.slice(0, 3).toUpperCase()}`, qty: Math.floor(n.qty / Math.max(1, n.colors.length)),
    })));
  }
  return { row: skuNum, ok: true, sku };
}

export async function createProductAction(p: NewProduct): Promise<RowResult> {
  const sb = supabaseServer();
  const [formula, sku] = await Promise.all([getPricingFormula(), nextSku(sb)]);
  const res = await insertOne(sb, formula, p, sku);
  revalidatePath("/admin/catalogue"); revalidatePath("/shop");
  return res;
}

export async function bulkUploadAction(categoryId: string, rows: Omit<NewProduct, "categoryId">[]): Promise<{ created: number; results: RowResult[] }> {
  const sb = supabaseServer();
  const formula = await getPricingFormula();
  let skuNum = await nextSku(sb);
  const results: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = await insertOne(sb, formula, { ...r, categoryId }, skuNum);
    results.push({ ...res, row: i + 1 });
    if (res.ok) skuNum++;
  }
  revalidatePath("/admin/catalogue"); revalidatePath("/shop");
  return { created: results.filter((r) => r.ok).length, results };
}
