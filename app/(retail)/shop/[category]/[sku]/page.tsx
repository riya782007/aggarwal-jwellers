export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySku, getPricingFormula } from "@/lib/supabase/queries";
import { resolveProductContent } from "@/lib/content";
import { liveOffer } from "@/lib/offers";
import { formatPaise, computePrices } from "@/lib/pricing";
import { ProductImage } from "@/components/Placeholder";

type Params = { params: { category: string; sku: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await getProductBySku(params.sku);
  if (!p) return { title: "Product not found" };
  const content = resolveProductContent({
    name: p.name, sku: p.sku, categoryName: p.category?.name,
    colors: p.variants?.map((v) => v.color ?? "").filter(Boolean),
    generated_content: p.generated_content,
  });
  return {
    title: content.seo.metaTitle,
    description: content.seo.metaDescription,
    keywords: content.seo.keywords,
    openGraph: { title: content.seo.metaTitle, description: content.seo.metaDescription },
  };
}

export default async function ProductPage({ params }: Params) {
  const [p, formula] = await Promise.all([getProductBySku(params.sku), getPricingFormula()]);
  if (!p) notFound();

  const content = resolveProductContent({
    name: p.name, sku: p.sku, categoryName: p.category?.name,
    colors: p.variants?.map((v) => v.color ?? "").filter(Boolean),
    keywords: content_keywords(p),
    generated_content: p.generated_content,
  });
  const o = liveOffer(p.base_wholesale, formula);
  const w = computePrices(p.base_wholesale, formula);
  const hero = (p.images ?? []).find((i) => i.kind === "model") ?? p.images?.[0];

  // LocalBusiness + Product structured data (Req 16.3) — SEO/Maps.
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.name, sku: p.sku, category: p.category?.name,
    description: content.seo.metaDescription,
    brand: { "@type": "Brand", name: "Blythe Diva" },
    offers: { "@type": "Offer", priceCurrency: "INR", price: (o.price / 100).toFixed(2), availability: p.qty > 0 ? "InStock" : "OutOfStock" },
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-xs text-diva-ink/50 mb-5">
        <Link href="/shop" className="hover:text-diva-rose">Shop</Link> ·{" "}
        <Link href={`/shop/${p.category.slug}`} className="hover:text-diva-rose">{p.category.name}</Link> · {p.sku}
      </nav>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-white shadow-sm relative">
            <ProductImage src={hero?.path} name={p.name} />
            {o.hasOffer && (
              <span className="absolute top-3 left-3 bg-diva-rose text-white text-sm font-semibold px-3 py-1 rounded-full">{o.offerPct}% OFF</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {(p.images ?? []).slice(0, 4).map((img) => (
              <div key={img.id} className="aspect-square rounded-lg overflow-hidden bg-white"><ProductImage src={img.path} name={p.name} /></div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-diva-gold">{p.category.name} · {p.sku}</p>
          <h1 className="font-serif text-3xl text-diva-ink mt-1">{content.title}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-diva-ink">{formatPaise(o.price)}</span>
            {o.hasOffer && <span className="text-lg text-diva-ink/40 line-through">{formatPaise(o.mrp)}</span>}
            {o.hasOffer && <span className="text-sm font-semibold text-green-700">Save {formatPaise(o.savings)} ({o.offerPct}%)</span>}
          </div>
          <p className="text-xs text-diva-ink/50 mt-1">Inclusive of taxes · MRP {formatPaise(o.mrp)}</p>

          {p.variants && p.variants.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-diva-ink mb-2">Colour</p>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <span key={v.id} className="px-3 py-1.5 rounded-full border border-diva-ink/15 text-sm text-diva-ink/80">
                    {v.color}{v.qty <= 2 ? " · low" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button className="flex-1 px-6 py-3 rounded-full bg-diva-rose text-white font-medium">Add to cart</button>
            <a href={`https://wa.me/919873151767?text=${encodeURIComponent("I want to order " + p.name + " (" + p.sku + ")")}`}
               className="px-6 py-3 rounded-full bg-green-600 text-white font-medium">WhatsApp</a>
          </div>
          <p className="text-xs text-diva-ink/50 mt-2">COD available · Ships from Sadar Bazar, Delhi</p>

          <div className="mt-7 prose prose-sm">
            <p className="text-diva-ink/80 leading-relaxed">{content.description}</p>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-diva-ink mb-2">Specifications</h3>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              {Object.entries(content.specs).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-diva-ink/50">{k}</dt><dd className="text-diva-ink/90">{v}</dd></div>
              ))}
            </dl>
          </div>

          <p className="mt-6 text-xs text-diva-ink/40">Wholesale rate: {formatPaise(w.wholesaleRate)} · MOQ applies for retailers</p>
        </div>
      </div>
    </main>
  );
}

function content_keywords(p: any): string[] {
  return [p.category?.name, "Sadar Bazar", "Delhi"].filter(Boolean);
}