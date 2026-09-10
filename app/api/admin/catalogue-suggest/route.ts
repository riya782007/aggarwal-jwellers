import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Typeahead for Admin → Catalogue: partial SKU/name/colour with live stock. */
export async function GET(req: Request) {
  const s = getSession();
  if (!s.authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  // Two characters minimum: a single letter matches most of a 1,200-SKU catalogue, so it cost a full
  // scan on every keystroke and returned nothing useful.
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const sb = supabaseServer();
  // Strip the characters that are syntax to PostgREST's or() filter as well as LIKE wildcards —
  // a name containing a comma or bracket used to break the whole query, so the search silently
  // returned nothing for those products.
  const bare = q.replace(/[%_,()]/g, "");
  if (!bare) return NextResponse.json({ hits: [] });
  const starts = `${bare}%`;
  const like = `%${bare}%`;

  const PRODUCT_COLS = "id,sku,name,qty,status, thumbnail_path, category:categories(name,slug)";
  const VARIANT_COLS = "sku,color,qty,product_id, product:products(id,sku,name,qty,status,thumbnail_path, category:categories(name,slug))";

  // Sept 2026 — the search "couldn't find" products that plainly existed.
  //
  // Cause: there was ONE query per table, `ilike %q%` ordered by SKU, capped at 12. The cap was applied
  // by the DATABASE, alphabetically — so the 12 rows that came back were simply the alphabetically
  // first matches. Re-sorting them in JS afterwards could not rescue a row that was never fetched:
  // typing a SKU that started with your search still showed nothing if a dozen unrelated SKUs happened
  // to sort ahead of it. The narrower your term, the more it looked broken.
  //
  // Now the rows that START with the term are fetched by their own query, so an exact or prefix match
  // is ALWAYS in the result set; the "contains" query only fills the remaining space. The four run in
  // parallel, so this is no slower than the two it replaces.
  const [pStarts, pLike, vStarts, vLike] = await Promise.all([
    sb.from("products").select(PRODUCT_COLS).or(`sku.ilike.${starts},name.ilike.${starts}`).order("sku").limit(12),
    sb.from("products").select(PRODUCT_COLS).or(`name.ilike.${like},sku.ilike.${like}`).order("sku").limit(12),
    sb.from("variants").select(VARIANT_COLS).ilike("sku", starts).order("sku").limit(12),
    sb.from("variants").select(VARIANT_COLS).ilike("sku", like).limit(12),
  ]);

  // Prefix matches first so they can never be crowded out by the contains results.
  const prods = [...((pStarts.data as any[]) ?? []), ...((pLike.data as any[]) ?? [])];
  const vars = [...((vStarts.data as any[]) ?? []), ...((vLike.data as any[]) ?? [])];

  type Hit = {
    kind: "product" | "variant";
    id: string;
    sku: string;
    name: string;
    qty: number;
    status: string;
    category: string;
    categorySlug: string;
    image: string | null;
    variantSku?: string;
    color?: string | null;
    href: string;
  };

  const hits: Hit[] = [];
  const seen = new Set<string>();

  for (const p of ((prods as any[]) ?? [])) {
    const key = `p:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      kind: "product",
      id: p.id,
      sku: p.sku,
      name: p.name,
      qty: p.qty ?? 0,
      status: p.status ?? "draft",
      category: p.category?.name ?? "",
      categorySlug: p.category?.slug ?? "all",
      image: typeof p.thumbnail_path === "string" && p.thumbnail_path.startsWith("http") ? p.thumbnail_path : null,
      href: `/admin/catalogue?q=${encodeURIComponent(p.sku)}`,
    });
  }

  for (const v of ((vars as any[]) ?? [])) {
    const p = v.product;
    if (!p) continue;
    const key = `v:${v.sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      kind: "variant",
      id: p.id,
      sku: p.sku,
      name: p.name,
      qty: v.qty ?? 0,
      status: p.status ?? "draft",
      category: p.category?.name ?? "",
      categorySlug: p.category?.slug ?? "all",
      image: typeof p.thumbnail_path === "string" && p.thumbnail_path.startsWith("http") ? p.thumbnail_path : null,
      variantSku: v.sku,
      color: v.color ?? null,
      href: `/admin/catalogue?q=${encodeURIComponent(v.sku)}`,
    });
  }

  const qLower = q.toLowerCase();
  hits.sort((a, b) => {
    const as = (a.variantSku || a.sku).toLowerCase();
    const bs = (b.variantSku || b.sku).toLowerCase();
    const ap = as.startsWith(qLower) ? 0 : 1;
    const bp = bs.startsWith(qLower) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return as.localeCompare(bs);
  });

  return NextResponse.json({ hits: hits.slice(0, 14) }, { headers: { "Cache-Control": "no-store" } });
}
