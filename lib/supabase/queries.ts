/** Server-only data access. Uses the service-role client (bypasses RLS for admin reads). */
import "server-only";
import { supabaseServer } from "./server";
import type { PricingFormula } from "../pricing";

export type DbCategory = { id: string; name: string; slug: string };
export type DbVariant = { id: string; color: string | null; sku: string; qty: number; image_paths: string[] };
export type DbImage = { id: string; path: string; kind: string | null; sort: number };
export type DbProduct = {
  id: string; category_id: string; sku: string; name: string;
  type: "simple" | "configurable"; base_wholesale: number; qty: number;
  status: string; generated_content: any; last_movement_at: string | null;
};

export async function getPricingFormula(): Promise<PricingFormula> {
  const sb = supabaseServer();
  const { data } = await sb.from("pricing_settings").select("*").limit(1).single();
  return {
    wholesaleMarkupPct: Number(data?.wholesale_markup_pct ?? 10),
    retailMultiplier: Number(data?.retail_multiplier ?? 2.2),
    mrpMultiplier: Number(data?.mrp_multiplier ?? 2.75),
    roundToPaise: Number(data?.round_to ?? 100),
  };
}

export async function getCategories(): Promise<DbCategory[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("categories").select("id,name,slug").order("name");
  return data ?? [];
}

export async function getPublishedProducts(): Promise<(DbProduct & { category: DbCategory })[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("products")
    .select("*, category:categories(id,name,slug)")
    .eq("status", "published")
    .order("sku");
  return (data as any) ?? [];
}

export async function getProductBySku(sku: string): Promise<
  | (DbProduct & { category: DbCategory; variants: DbVariant[]; images: DbImage[] })
  | null
> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("products")
    .select("*, category:categories(id,name,slug), variants(*), images:product_images(*)")
    .eq("sku", sku)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function getProductSkus(): Promise<{ sku: string; slug: string }[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("products").select("sku, category:categories(slug)").eq("status", "published");
  return (data ?? []).map((r: any) => ({ sku: r.sku, slug: r.category?.slug ?? "all" }));
}

// ---------- dashboard + inventory intelligence (Req 6, 7; yogendra.pdf §8) ----------
import { classify, type InventoryRule, DEFAULT_RULE } from "../inventory";
import { computePrices, type PricingFormula as PF } from "../pricing";

export type DashboardData = {
  revenue: number; orders: number; cod: number; pos: number;
  retailers: number; pendingApprovals: number;
  totalProducts: number; newProducts: number; categories: number;
  dead: number; low: number; inactive: number; healthy: number;
  deadList: { sku: string; name: string; qty: number }[];
  lowList: { sku: string; name: string; qty: number }[];
};

export async function getDashboardData(fromISO: string, toISO: string, rule: InventoryRule = DEFAULT_RULE): Promise<DashboardData> {
  const sb = supabaseServer();
  const now = new Date();
  const [ordersRes, prodRes, catRes, retRes, apprRes] = await Promise.all([
    sb.from("orders").select("total,channel,payment_mode,created_at").gte("created_at", fromISO).lte("created_at", toISO),
    sb.from("products").select("sku,name,qty,last_movement_at,created_at,category:categories(name)"),
    sb.from("categories").select("id"),
    sb.from("retailers").select("id,approved"),
    sb.from("approvals").select("id,status"),
  ]);
  const orders = ordersRes.data ?? [];
  const products = (prodRes.data as any[]) ?? [];

  const revenue = orders.reduce((s, o: any) => s + (o.total ?? 0), 0);
  const cod = orders.filter((o: any) => o.payment_mode === "cod").length;
  const pos = orders.filter((o: any) => o.channel === "pos").length;

  const classed = products.map((p: any) => ({ ...p, cls: classify({ qty: p.qty, lastMovementAt: p.last_movement_at }, rule, now) }));
  const dead = classed.filter((p) => p.cls === "dead");
  const low = classed.filter((p) => p.cls === "low");
  const inactive = classed.filter((p) => p.cls === "inactive");
  const healthy = classed.filter((p) => p.cls === "healthy");
  const newProducts = products.filter((p: any) => p.created_at >= fromISO && p.created_at <= toISO).length;

  return {
    revenue, orders: orders.length, cod, pos,
    retailers: (retRes.data ?? []).filter((r: any) => r.approved).length,
    pendingApprovals: (apprRes.data ?? []).filter((a: any) => a.status === "pending").length,
    totalProducts: products.length, newProducts, categories: (catRes.data ?? []).length,
    dead: dead.length, low: low.length, inactive: inactive.length, healthy: healthy.length,
    deadList: dead.slice(0, 8).map((p) => ({ sku: p.sku, name: p.name, qty: p.qty })),
    lowList: low.slice(0, 8).map((p) => ({ sku: p.sku, name: p.name, qty: p.qty })),
  };
}

export type ClassifiedRow = { sku: string; name: string; category: string; qty: number; lastMovementAt: string | null; cls: string };

export async function getInventoryClassified(rule: InventoryRule = DEFAULT_RULE): Promise<ClassifiedRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("products").select("sku,name,qty,last_movement_at,category:categories(name)").order("sku");
  const now = new Date();
  return ((data as any[]) ?? []).map((p) => ({
    sku: p.sku, name: p.name, category: p.category?.name ?? "—", qty: p.qty, lastMovementAt: p.last_movement_at,
    cls: classify({ qty: p.qty, lastMovementAt: p.last_movement_at }, rule, now),
  }));
}

export async function getApprovals() {
  const sb = supabaseServer();
  const { data } = await sb.from("approvals").select("*").order("created_at", { ascending: false });
  return data ?? [];
}
