export const dynamic = "force-dynamic";

import Link from "next/link";
import { getPublishedProducts, getPricingFormula } from "@/lib/supabase/queries";
import { liveOffer } from "@/lib/offers";
import { formatPaise } from "@/lib/pricing";
import { ProductImage } from "@/components/Placeholder";

export const metadata = {
  title: "Shop Artificial Jewellery",
  description: "Browse necklaces, bracelets, anklets, earrings and rings from Blythe Diva, Sadar Bazar Delhi.",
};

export default async function ShopPage() {
  const [products, formula] = await Promise.all([getPublishedProducts(), getPricingFormula()]);
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8 text-center">
        <p className="text-diva-gold tracking-[0.3em] text-xs uppercase">Blythe Diva</p>
        <h1 className="font-serif text-4xl text-diva-ink">The Boutique</h1>
        <p className="text-diva-ink/60 mt-2">{products.length} designs · live retail pricing</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {products.map((p) => {
          const o = liveOffer(p.base_wholesale, formula);
          return (
            <Link key={p.id} href={`/shop/${p.category.slug}/${p.sku}`}
              className="group rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition">
              <div className="aspect-[4/5] relative">
                <ProductImage name={p.name} />
                {o.hasOffer && (
                  <span className="absolute top-2 left-2 bg-diva-rose text-white text-xs font-semibold px-2 py-1 rounded-full">
                    {o.offerPct}% OFF
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-[11px] uppercase tracking-wide text-diva-gold">{p.category.name} · {p.sku}</p>
                <h2 className="text-sm font-medium text-diva-ink leading-snug line-clamp-2 group-hover:text-diva-rose">{p.name}</h2>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-semibold text-diva-ink">{formatPaise(o.price)}</span>
                  {o.hasOffer && <span className="text-xs text-diva-ink/40 line-through">{formatPaise(o.mrp)}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}