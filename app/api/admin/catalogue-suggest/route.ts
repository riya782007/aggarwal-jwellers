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
  if (q.length < 1) return NextResponse.json({ hits: [] });

  const sb = supabaseServer();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const { data: prods } = await sb
    .from("products")
    .select("id,sku,name,qty,status, thumbnail_path, category:categories(name,slug)")
    .or(`name.ilike.${like},sku.ilike.${like}`)
    .order("sku")
    .limit(12);

  const { data: vars } = await sb
    .from("variants")
    .select("sku,color,qty,product_id, product:products(id,sku,name,qty,status,thumbnail_path, category:categories(name,slug))")
    .ilike("sku", like)
    .limit(12);

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
