import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { getStorefront, getFeaturedReviews, getShoppableReels, getActivePromotions } from "@/lib/supabase/queries";
import { ProductCard } from "@/components/site/ProductCard";
import { PromoHero } from "@/components/site/PromoHero";
import { ProductImage } from "@/components/Placeholder";
import { TrustBar } from "@/components/site/TrustBar";
import { Reveal } from "@/components/site/Reveal";
import { Stars } from "@/components/site/Stars";
import { ReelsSection } from "@/components/site/ReelsSection";

/**
 * Shared storefront index. Rendered by BOTH the site root ("/") and "/shop".
 * It is a plain server component (NOT a page.tsx) on purpose: having one route's
 * page import another route's page module triggers a Next 14 build bug
 * (ENOENT page_client-reference-manifest.js). Sharing a component avoids that.
 */
export async function ShopIndex() {
  const [{ products: allProducts, formula }, reviews, reels, promos] = await Promise.all([getStorefront(), getFeaturedReviews(), getShoppableReels(), getActivePromotions("retail")]);
  // 0049: never show a photo-less card on the storefront — drafts stay in the console until shot.
  const products = allProducts.filter((p: any) => p.image);
  const cats = Array.from(new Map(products.map((p) => [p.category.slug, p.category])).values());
  const bestsellers = [...products].sort((a, b) => b.reviews - a.reviews).slice(0, 8);
  const trending = products.slice(0, 8);
  // Real product photos for the hero marquee (auto-scrolling strip).
  const marquee = products.slice(0, 12) as any[];

  return (
    <>
      {/* AI promotional poster (festive offers) — auto-placed when the owner publishes a campaign. */}
      <PromoHero promos={promos} />

      {/* HERO — centered headline + full-width auto-scrolling product marquee (distinct silhouette
          from the split layout, same palette). */}
      <section className="relative overflow-hidden bg-gradient-to-b from-cream to-ivory">
        {/* soft palette glows */}
        <div className="pointer-events-none absolute -top-16 left-1/4 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute top-10 right-1/4 h-64 w-64 rounded-full bg-emerald/10 blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-5 pt-16 md:pt-24 pb-10 text-center animate-fadeUp">
          <p className="text-gold-dark tracking-[0.35em] uppercase text-xs mb-5">Aggarwal Jewellers · Fine Artificial Jewellery</p>
          <h1 className="font-display text-5xl md:text-7xl leading-[1.02] text-ink">
            Adorn your <span className="text-gold-gradient italic">every</span> moment.
          </h1>
          <p className="text-muted mt-5 max-w-xl mx-auto leading-relaxed">
            Handcrafted Kundan, Meenakari &amp; Temple jewellery — premium anti-tarnish finish, straight from Sadar Bazar, Delhi.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Link href="#bestsellers" className="btn-primary px-8 py-3 text-sm font-medium">Shop the collection</Link>
            <Link href="#bestsellers" className="px-8 py-3 text-sm font-medium rounded-full border border-ink/15 text-ink hover:border-gold hover:text-wine transition-colors">New arrivals</Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-7 text-sm text-muted">
            <span>Anti-tarnish finish</span><span className="text-gold">·</span><span>Cash on Delivery</span><span className="text-gold">·</span><span>Free shipping over ₹999</span>
          </div>
        </div>

        {/* Full-width product marquee — real photos, seamless auto-scroll, pauses on hover. */}
        {marquee.length > 0 ? (
          <div className="relative pb-16 [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]">
            <div className="flex w-max gap-5 aj-marquee">
              {[...marquee, ...marquee].map((p, i) => (
                <Link key={`${p.sku}-${i}`} href={`/shop/${p.category?.slug ?? "all"}/${p.sku}`} aria-hidden={i >= marquee.length ? true : undefined}
                  className="group relative shrink-0 w-40 md:w-52">
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-luxe ring-1 ring-gold/15 bg-white">
                    <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  <p className="mt-2 text-xs text-ink/80 truncate px-1">{p.name}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="pb-10" />
        )}

        {/* Scoped marquee animation (respects reduced-motion; pauses on hover). */}
        <style>{`
          @keyframes aj-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          .aj-marquee { animation: aj-marquee 45s linear infinite; will-change: transform; }
          .aj-marquee:hover { animation-play-state: paused; }
          @media (prefers-reduced-motion: reduce) { .aj-marquee { animation: none; } }
        `}</style>
      </section>

      <section className="max-w-7xl mx-auto px-5 -mt-6 relative z-10"><TrustBar /></section>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-5 py-16">
        <Reveal>
          <div className="text-center mb-8">
            <p className="text-gold-dark tracking-[0.25em] uppercase text-xs">Find your style</p>
            <h2 className="font-display text-4xl text-ink mt-1">Shop by Category</h2>
          </div>
        </Reveal>
        {/* GIVA-style category circles — horizontal scroll on mobile, centered on desktop */}
        <div className="flex gap-5 md:gap-8 overflow-x-auto pb-3 snap-x justify-start md:justify-center [-ms-overflow-style:none] [scrollbar-width:none]">
          {cats.map((c) => (
            <Link key={c.slug} href={`/shop/c/${c.slug}`} className="group shrink-0 snap-start text-center w-24 md:w-32">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden ring-1 ring-sand group-hover:ring-2 group-hover:ring-gold transition-all shadow-card">
                <div className="card-img h-full w-full"><ProductImage name={c.name} /></div>
              </div>
              <p className="mt-2.5 text-[13px] md:text-sm font-medium text-ink group-hover:text-wine transition-colors">{c.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* BESTSELLERS — only when products exist */}
      {bestsellers.length > 0 && (
      <section id="bestsellers" className="max-w-7xl mx-auto px-5 py-8">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="text-gold-dark tracking-[0.25em] uppercase text-xs">Loved by thousands</p>
            <h2 className="font-display text-4xl text-ink mt-1">Bestsellers</h2>
          </div>
          <Link href="/shop/c/necklace" className="nav-link text-sm text-emerald">View all <Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {bestsellers.map((p, i) => (
            <Reveal key={p.sku} delay={(i % 4) * 80}><ProductCard p={p as any} formula={formula} index={i} /></Reveal>
          ))}
        </div>
      </section>
      )}

      {/* FESTIVE BANNER */}
      <section className="max-w-7xl mx-auto px-5 py-12">
        <Reveal>
          <div className="rounded-3xl bg-ink text-cream px-8 py-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 20% 20%, #C79A2D, transparent 40%), radial-gradient(circle at 80% 80%, #2F6B3C, transparent 40%)" }} />
            <p className="relative text-gold-light tracking-[0.3em] uppercase text-xs">Aggarwal Jewellers</p>
            <h2 className="relative font-display text-4xl md:text-5xl mt-2">Anti-tarnish. Trend-ready.</h2>
            <p className="relative text-cream/70 mt-3">Handcrafted Kundan, Meena &amp; Temple jewellery. Free shipping over ₹999 · Cash on delivery.</p>
            <Link href="#bestsellers" className="relative btn-gold inline-block mt-6 px-8 py-3 text-sm font-medium">Shop now</Link>
          </div>
        </Reveal>
      </section>

      {/* TRENDING — only when products exist */}
      {trending.length > 0 && (
      <section className="max-w-7xl mx-auto px-5 py-8">
        <h2 className="font-display text-4xl text-ink mb-7">New &amp; Trending</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {trending.map((p, i) => (
            <Reveal key={p.sku} delay={(i % 4) * 80}><ProductCard p={p as any} formula={formula} index={i} /></Reveal>
          ))}
        </div>
      </section>
      )}

      <ReelsSection reels={reels} />

      {/* REVIEWS — only when there are real reviews */}
      {reviews.length > 0 && (
      <section className="bg-emerald-mist/60 py-16 mt-12">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal>
            <div className="text-center mb-9">
              <p className="text-gold-dark tracking-[0.25em] uppercase text-xs">Real words, real customers</p>
              <h2 className="font-display text-4xl text-ink mt-1">Happy Customers</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {reviews.map((r, i) => (
              <Reveal key={r.id} delay={i * 90}>
                <div className="bg-white rounded-2xl p-6 shadow-card h-full">
                  <Stars rating={r.rating} size="md" />
                  <p className="text-ink/80 mt-3 leading-relaxed">“{r.body}”</p>
                  <p className="text-sm font-medium text-ink mt-4">{r.author_name} <span className="text-muted font-normal">· verified buyer</span></p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}
    </>
  );
}
