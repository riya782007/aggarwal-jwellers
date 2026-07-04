import Link from "next/link";
import { ProductImage } from "@/components/Placeholder";
import { AddToCart } from "@/components/cart/AddToCart";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { formatPaise } from "@/lib/pricing";
import { liveOffer } from "@/lib/offers";
import { overridesOf } from "@/lib/pricing";
import type { PricingFormula } from "@/lib/pricing";

export type CardProduct = {
  sku: string; name: string; base_wholesale: number; qty: number;
  category: { name: string; slug: string };
  rating: number; reviews: number; isNew?: boolean;
  image?: string | null;
  wholesale_override?: number | null; retail_override?: number | null; mrp_override?: number | null;
};

export function ProductCard({ p, formula, index = 0, bestseller = false }: { p: CardProduct; formula: PricingFormula; index?: number; bestseller?: boolean }) {
  const o = liveOffer(p.base_wholesale, formula, overridesOf(p));
  const low = p.qty > 0 && p.qty <= 3;
  return (
    <div className="group relative flex flex-col rounded-xl bg-white border border-sand/60 hover:border-gold/50 hover:shadow-luxe transition-all duration-300 overflow-hidden">
      <Link href={`/shop/${p.category.slug}/${p.sku}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-ivory">
          <div className="card-img h-full w-full"><ProductImage name={p.name} src={p.image} /></div>
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            {bestseller && <span className="bg-gold text-ink text-[10.5px] font-bold px-2 py-0.5 rounded">BESTSELLER</span>}
            {p.isNew && !bestseller && <span className="bg-emerald text-white text-[10.5px] font-bold px-2 py-0.5 rounded">NEW</span>}
            {o.hasOffer && <span className="bg-wine text-white text-[10.5px] font-bold px-2 py-0.5 rounded">{o.offerPct}% OFF</span>}
          </div>
          {low && <span className="absolute bottom-2.5 left-2.5 bg-ink/80 text-white text-[10px] px-2 py-1 rounded-full">Only {p.qty} left</span>}
        </div>
      </Link>

      <WishlistButton item={{ sku: p.sku, name: p.name, category: p.category.name, categorySlug: p.category.slug, price: o.price }}
        className="absolute top-2.5 right-2.5 h-9 w-9 grid place-items-center rounded-full bg-white/90 shadow-sm hover:scale-110 transition-transform" />

      <div className="flex flex-col flex-1 p-3.5">
        <Link href={`/shop/${p.category.slug}/${p.sku}`} className="block">
          <h3 className="text-[14px] font-medium text-ink leading-snug line-clamp-1 group-hover:text-wine transition-colors">{p.name}</h3>
          <p className="mt-1 text-[12.5px] text-muted">
            <span className="text-ink font-medium">{p.rating.toFixed(1)}</span>
            <span className="text-gold"> ★</span>
            {p.reviews > 0 && <span> | {p.reviews}</span>}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[15.5px] font-semibold text-ink">{formatPaise(o.price)}</span>
            {o.hasOffer && <span className="text-[12.5px] text-muted line-through">{formatPaise(o.mrp)}</span>}
            {o.hasOffer && <span className="text-[12px] text-emerald font-semibold">{o.offerPct}% off</span>}
          </div>
        </Link>
        <div className="mt-3">
          <AddToCart variant="card" item={{ sku: p.sku, name: p.name, price: o.price, category: p.category.slug }} />
        </div>
      </div>
    </div>
  );
}
