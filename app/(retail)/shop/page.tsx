export const dynamic = "force-dynamic";
import Link from "next/link";
import { getStorefront, getFeaturedReviews, getShoppableReels } from "@/lib/supabase/queries";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductImage } from "@/components/Placeholder";
import { TrustBar } from "@/components/site/TrustBar";
import { Reveal } from "@/components/site/Reveal";
import { Stars } from "@/components/site/Stars";
import { ReelsSection } from "@/components/site/ReelsSection";

export const metadata = {
  title: "Premium Artificial Jewellery — Kundan, Meena, Temple",
  description: "Shop handcrafted artificial jewellery from Aggarwal Jewellers, Sadar Bazar Delhi. Necklaces, earrings, bracelets, anklets & rings at retail and wholesale.",
};

const CHIPS = [
  { label: "Under ₹499", href: "/shop?max=499" },
  { label: "Bestsellers", href: "#bestsellers" },
  { label: "New Launch", href: "#trending" },
  { label: "Gifting", href: "#gifting" },
  { label: "Wholesale / थोक", href: "/wholesale" },
];

export default async function Shop() {
  const [{ products, formula }, reviews, reels] = await Promise.all([getStorefront(), getFeaturedReviews(), getShoppableReels()]);
  const cats = Array.from(new Map(products.map((p) => [p.category.slug, p.category])).values());
  const bestsellers = [...products].sort((a, b) => b.reviews - a.reviews).slice(0, 8);
  const trending = products.slice(0, 8);

  return (
    <>
      {/* HERO — clean, light, single focal image */}
      <section className="bg-gradient-to-b from-ivory to-white border-b border-sand/40">
        <div className="max-w-7xl mx-auto px-5 py-12 md:py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="animate-fadeUp">
            <p className="text-gold-dark tracking-[0.3em] uppercase text-[11px] mb-4">Handcrafted in Sadar Bazar · Since generations</p>
            <h1 className="font-display text-[44px] md:text-6xl leading-[1.06] text-ink">
              Jewellery for your <em className="not-italic text-wine">every</em> day.
            </h1>
            <p className="text-muted mt-4 max-w-md leading-relaxed">
              Kundan, Meenakari &amp; Temple designs with premium anti-tarnish finish — at honest Sadar Bazar prices.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="#bestsellers" className="btn-primary px-8 py-3.5 text-sm font-semibold">Shop Bestsellers</Link>
              <Link href="#categories" className="px-8 py-3.5 text-sm font-semibold rounded-[14px] border border-ink/15 text-ink hover:border-wine hover:text-wine transition-colors">Browse Categories</Link>
            </div>
            <p className="flex items-center gap-5 mt-7 text-[13px] text-muted">
              <span><b className="text-ink">4.8 ★</b> rating</span>
              <span><b className="text-ink">50,000+</b> customers</span>
              <span><b className="text-ink">COD</b> available</span>
            </p>
          </div>
          <div className="relative h-[320px] md:h-[420px] rounded-3xl overflow-hidden shadow-luxe">
            <ProductImage name="Kundan Bridal Set" />
            <div className="absolute bottom-4 left-4 bg-white/95 rounded-xl px-4 py-2.5 shadow-card">
              <p className="text-[11px] uppercase tracking-widest text-gold-dark">Festive Edit</p>
              <p className="text-sm font-semibold text-ink">Flat 20% off sitewide</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick chips */}
      <section className="max-w-7xl mx-auto px-5 pt-6">
        <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {CHIPS.map((c) => (
            <Link key={c.label} href={c.href}
              className="shrink-0 px-4 py-2 rounded-full border border-sand text-[13px] font-medium text-ink/80 hover:border-wine hover:text-wine transition-colors bg-white">
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-5 pt-6"><TrustBar /></section>

      {/* CATEGORIES — GIVA-style circles, horizontal scroll */}
      <section id="categories" className="max-w-7xl mx-auto px-5 py-14">
        <Reveal>
          <div className="text-center mb-8">
            <h2 className="font-display text-[32px] md:text-4xl text-ink">Shop by Category</h2>
            <p className="text-muted text-sm mt-1.5">Find your style — necklace se anklet tak</p>
          </div>
        </Reveal>
        <div className="flex gap-5 md:gap-8 overflow-x-auto pb-3 snap-x justify-start md:justify-center [-ms-overflow-style:none] [scrollbar-width:none]">
          {cats.map((c, i) => (
            <Link key={c.slug} href={`/shop/c/${c.slug}`} className="group shrink-0 snap-start text-center w-24 md:w-32">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden ring-1 ring-sand group-hover:ring-2 group-hover:ring-gold transition-all shadow-card">
                <div className="card-img h-full w-full"><ProductImage name={c.name} /></div>
              </div>
              <p className="mt-2.5 text-[13px] md:text-sm font-medium text-ink group-hover:text-wine transition-colors">{c.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* BESTSELLERS */}
      <section id="bestsellers" className="max-w-7xl mx-auto px-5 py-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-[32px] md:text-4xl text-ink">Bestsellers</h2>
            <p className="text-muted text-sm mt-1">Loved by thousands across India</p>
          </div>
          <Link href="/shop/c/necklace" className="nav-link text-sm text-wine font-medium">View all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {bestsellers.map((p, i) => (
            <Reveal key={p.sku} delay={(i % 4) * 70}><ProductCard p={p as any} formula={formula} index={i} bestseller={i < 4} /></Reveal>
          ))}
        </div>
      </section>

      {/* GIFTING / OFFER BANNER — light gold, not dark */}
      <section id="gifting" className="max-w-7xl mx-auto px-5 py-12">
        <Reveal>
          <div className="rounded-3xl bg-gradient-to-r from-gold/15 via-ivory to-gold/15 border border-gold/30 px-8 py-12 text-center">
            <p className="text-gold-dark tracking-[0.3em] uppercase text-[11px]">Festive &amp; Gifting Edit</p>
            <h2 className="font-display text-3xl md:text-5xl mt-2 text-ink">Flat 20% off, <span className="text-wine">sitewide</span></h2>
            <p className="text-muted mt-3">No code needed · Free shipping over ₹999 · Cash on delivery</p>
            <Link href="#bestsellers" className="btn-primary inline-block mt-6 px-9 py-3.5 text-sm font-semibold">Shop now</Link>
          </div>
        </Reveal>
      </section>

      {/* TRENDING */}
      <section id="trending" className="max-w-7xl mx-auto px-5 py-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-[32px] md:text-4xl text-ink">New &amp; Trending</h2>
            <p className="text-muted text-sm mt-1">Fresh designs, straight from the karkhana</p>
          </div>
          <Link href="/shop?sort=new" className="nav-link text-sm text-wine font-medium">View all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {trending.map((p, i) => (
            <Reveal key={p.sku} delay={(i % 4) * 70}><ProductCard p={p as any} formula={formula} index={i} /></Reveal>
          ))}
        </div>
      </section>

      <ReelsSection reels={reels} />

      {/* REVIEWS */}
      <section className="bg-ivory py-16 mt-12">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal>
            <div className="text-center mb-9">
              <h2 className="font-display text-[32px] md:text-4xl text-ink">Happy Customers</h2>
              <p className="text-muted text-sm mt-1.5">Real words, real buyers</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {reviews.map((r, i) => (
              <Reveal key={r.id} delay={i * 90}>
                <div className="bg-white rounded-2xl p-6 border border-sand/60 shadow-card h-full">
                  <Stars rating={r.rating} size="md" />
                  <p className="text-ink/80 mt-3 leading-relaxed">“{r.body}”</p>
                  <p className="text-sm font-medium text-ink mt-4">{r.author_name} <span className="text-muted font-normal">· verified buyer</span></p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
