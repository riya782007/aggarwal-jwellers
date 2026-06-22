export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySku, getCategories, getPricingFormula } from "@/lib/supabase/queries";
import { ProductEditor, type EditorProduct } from "@/components/admin/ProductEditor";

export const metadata = { title: "Owner Console · Edit product" };

export default async function EditProduct({ params }: { params: { sku: string } }) {
  const [p, categories, formula] = await Promise.all([
    getProductBySku(params.sku),
    getCategories(),
    getPricingFormula(),
  ]);
  if (!p) notFound();

  const gc = (p.generated_content as any) ?? {};
  const seo = gc.seo ?? {};
  const specs = gc.specs ?? {};
  const specsText = Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join("\n");

  const product: EditorProduct = {
    sku: p.sku,
    name: p.name,
    categoryId: p.category?.id ?? "",
    categorySlug: p.category?.slug ?? "all",
    type: p.type,
    status: p.status,
    basePriceRupees: Math.round((p.base_wholesale ?? 0) / 100),
    qty: p.qty ?? 0,
    title: gc.title ?? p.name,
    description: gc.description ?? "",
    tags: (gc.tags ?? []).join("\n"),
    metaTitle: seo.metaTitle ?? "",
    metaDescription: seo.metaDescription ?? "",
    keywords: (seo.keywords ?? []).join("\n"),
    specs: specsText,
  };

  return (
    <main className="p-8 bg-cream/40 min-h-screen">
      <div className="mb-5">
        <Link href="/admin/catalogue" className="text-sm text-muted hover:text-ink">← Catalogue</Link>
        <h1 className="font-display text-4xl text-ink mt-1">Edit · {p.name}</h1>
        <p className="text-sm text-muted">{p.category?.name} · {p.sku} — edit every detail, content and SEO field below.</p>
      </div>
      <ProductEditor
        product={product}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        formula={{
          retailMultiplier: formula.retailMultiplier,
          mrpMultiplier: formula.mrpMultiplier,
          wholesaleMarkupPct: formula.wholesaleMarkupPct,
        }}
      />
    </main>
  );
}
