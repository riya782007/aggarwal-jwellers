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
  // Featured piece for the editorial hero — the top bestseller (real uploaded photo).
  const hero = (bestsellers[0] ?? products[0]) as any ?? null;

  return (
    <>
      {/* AI promotional poster (festive offers) — auto-placed when the owner publishes a campaign. */}
      <PromoHero promos={promos} />

      {/* HERO — editorial split: headline left, one featured piece (real photo) right */}
      <section className="relative overflow-hidden bg-gradient-to-b from-cream to-ivory">
        <div className="max-w-7xl mx-auto px-5 py-14 md:py-24 grid md:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center">
          <div className="animate-fadeUp">
            <p className="text-gold-dark tracking-[0.3em] uppercase text-xs mb-4">Aggarwal Jewellers · Bridal · AD · Anti-Tarnish · Daily-wear</p>
            <h1 className="font-display text-5xl md:text-[4.2rem] leading-[1.03] text-ink">
              Adorn your <span className="text-gold-gradient italic">every</span> moment.
            </h1>
            <p className="text-muted mt-5 max-w-md leading-relaxed">
              Handcrafted Kundan, Meenakari & Temple jewellery — premium anti-tarnish finish and trend-ready designs.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="#bestsellers" className="btn-primary px-7 py-3 text-sm font-medium">Shop the collection</Link>
              <Link href="#bestsellers" className="px-7 py-3 text-sm font-medium rounded-full border border-ink/15 text-ink hover:border-gold hover:text-wine transition-colors">Explore bestsellers</Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-muted">
              <span>Anti-tarnish finish</span><span className="text-gold">·</span><span>Cash on Delivery</span><span className="text-gold">·</span><span>Free shipping over ₹999</span>
            </div>
          </div>

          {/* Featured piece */}
          <div className="animate-fadeUp">
            {hero?.image ? (
              <Link href={`/shop/${hero.category?.slug ?? "all"}/${hero.sku}`} className="group relative block max-w-md mx-auto md:mr-0 md:ml-auto">
                <div className="hidden md:block absolute -z-10 -right-8 -top-8 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
                <div className="hidden md:block absolute -z-10 -left-8 -bottom-8 h-36 w-36 rounded-full bg-emerald/10 blur-3xl" />
                <div className="relative aspect-[4/5] rounded-[2.25rem] overflow-hidden shadow-luxe ring-1 ring-gold/20">
                  <img src={hero.image} alt={hero.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 via-ink/20 to-transparent p-5">
                    <p className="text-cream/80 text-[11px] tracking-[0.25em] uppercase">Featured piece</p>
                    <p className="text-white font-display text-2xl leading-tight mt-0.5">{hero.name}</p>
                  </div>
                </div>
                {/* small floating trust chip to keep the corner lively (distinct from the old 3-card collage) */}
                <div className="hidden sm:flex absolute -left-4 top-8 items-center gap-2 bg-white/95 backdrop-blur rounded-full pl-2 pr-3 py-1.5 shadow-luxe animate-float">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-mist text-emerald-dark"><Icon name="check" className="w-3.5 h-3.5" /></span>
                  <span className="text-[11px] font-medium text-ink">Anti-tarnish</span>
                </div>
              </Link>
            ) : (
              // Fallback collage only when there's no product photo yet.
              <div className="relative h-[360px] md:h-[440px]">
                <div className="absolute right-0 top-0 w-52 h-64 rounded-3xl overflow-hidden shadow-luxe rotate-3 animate-float"><ProductImage name="Kundan Set" /></div>
                <div className="absolute left-2 top-16 w-44 h-56 rounded-3xl overflow-hidden shadow-luxe -rotate-6 animate-float" style={{ animationDelay: "1s" }}><ProductImage name="Meena Haar" /></div>
                <div className="absolute left-28 bottom-0 w-40 h-48 rounded-3xl overflow-hidden shadow-gold rotate-2 animate-float" style={{ animationDelay: "2s" }}><ProductImage name="Jhumka" /></div>
              </div>
            )}
          </div>
        </div>
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
