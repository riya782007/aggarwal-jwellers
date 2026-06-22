export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getProductBySku, getCategories, getPricingFormula } from "@/lib/supabase/queries";
import { ProductEditor, type EditorProduct } from "@/components/admin/ProductEditor";
import { requirePerm } from "@/lib/auth";
import { addVariantAction, updateVariantAction, deleteVariantAction } from "@/app/actions/variants";

export const metadata = { title: "Owner Console · Edit product" };

export default async function EditProduct({ params }: { params: { sku: string } }) {
  if (!(await requirePerm("catalog.edit"))) redirect("/admin/dashboard?denied=editing+products");
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

      {/* Variants — colours/sizes with their own SKU & stock */}
      <section className="max-w-3xl mt-6 bg-white rounded-2xl border border-sand p-5 shadow-card">
        <h2 className="font-display text-xl text-ink mb-1">Variants</h2>
        <p className="text-xs text-muted mb-4">Add colour/size options — each gets its own SKU and stock count. Variant stock totals: <b className="text-ink">{(p.variants ?? []).reduce((s: number, v: any) => s + (v.qty ?? 0), 0)}</b> pcs.</p>

        <div className="space-y-2 mb-4">
          {(p.variants ?? []).length === 0 && <p className="text-sm text-muted">No variants yet — this is a simple product.</p>}
          {(p.variants ?? []).map((v: any) => (
            <form key={v.id} action={updateVariantAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="product_sku" value={p.sku} />
              <input name="color" defaultValue={v.color ?? ""} placeholder="Colour / size" className="rounded-xl border border-sand px-3 py-2 text-sm w-36 outline-none focus:border-emerald" />
              <input name="sku" defaultValue={v.sku ?? ""} placeholder="Variant SKU" className="rounded-xl border border-sand px-3 py-2 text-sm w-40 outline-none focus:border-emerald font-mono" />
              <label className="text-xs text-muted flex items-center gap-1">Stock <input name="qty" type="number" min={0} defaultValue={v.qty ?? 0} className="rounded-xl border border-sand px-2 py-2 text-sm w-20 text-center outline-none focus:border-emerald" /></label>
              <button className="px-3 py-2 rounded-xl bg-ink/5 text-ink text-xs hover:bg-ink/10">Save</button>
              <span />
              <button formAction={deleteVariantAction} className="text-muted hover:text-rose text-xs">Delete</button>
            </form>
          ))}
        </div>

        <form action={addVariantAction} className="flex flex-wrap items-center gap-2 border-t border-sand/60 pt-4">
          <input type="hidden" name="product_sku" value={p.sku} />
          <input name="color" placeholder="New colour / size *" className="rounded-xl border border-sand px-3 py-2 text-sm w-44 outline-none focus:border-emerald" required />
          <input name="sku" placeholder="SKU (blank = auto)" className="rounded-xl border border-sand px-3 py-2 text-sm w-44 outline-none focus:border-emerald font-mono" />
          <label className="text-xs text-muted flex items-center gap-1">Stock <input name="qty" type="number" min={0} defaultValue={0} className="rounded-xl border border-sand px-2 py-2 text-sm w-20 text-center outline-none focus:border-emerald" /></label>
          <button className="btn-primary px-4 py-2 text-sm font-medium">+ Add variant</button>
        </form>
      </section>
    </main>
  );
}
