import Link from "next/link";
import { PromoBar } from "./PromoBar";
import { MobileMenu } from "./MobileMenu";
import { CartWidget } from "@/components/cart/CartWidget";
import { SearchBox } from "./SearchBox";
import { WishlistWidget } from "@/components/wishlist/WishlistWidget";
import { IconUser } from "./Icons";

type Cat = { name: string; slug: string };

export function Header({ categories }: { categories: Cat[] }) {
  return (
    <header className="sticky top-0 z-40 bg-white">
      <PromoBar />
      {/* Row 1: logo · search · account/wishlist/cart */}
      <div className="border-b border-sand/50">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <MobileMenu categories={categories} />
            <Link href="/shop" className="leading-none">
              <span className="block font-display text-2xl md:text-[26px] text-wine tracking-tight">Aggarwal Jewellers</span>
              <span className="hidden md:block text-[9px] tracking-[0.32em] uppercase text-gold-dark mt-0.5">Sadar Bazar · Delhi</span>
            </Link>
          </div>
          <SearchBox />
          <div className="flex items-center gap-1.5 sm:gap-2 text-ink ml-auto">
            <Link href="/account" aria-label="Track order / Account" title="Track order"
              className="hidden sm:grid place-items-center p-2 rounded-full hover:bg-ivory hover:text-wine transition-colors"><IconUser /></Link>
            <WishlistWidget />
            <CartWidget />
          </div>
        </div>
      </div>
      {/* Row 2: category navigation (desktop) */}
      <nav className="hidden md:block bg-white border-b border-sand/50">
        <div className="max-w-7xl mx-auto px-5 h-11 flex items-center justify-center gap-8 text-[13.5px] text-ink/80">
          <div className="relative group">
            <button className="nav-link py-2 font-medium">Shop by Category</button>
            <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 z-50">
              <div className="bg-white rounded-2xl shadow-luxe p-4 grid grid-cols-2 gap-1 w-[360px] border border-sand/60">
                {categories.map((c) => (
                  <Link key={c.slug} href={`/shop/c/${c.slug}`}
                    className="px-3 py-2 rounded-lg text-ink/80 hover:bg-ivory hover:text-wine transition-colors">
                    {c.name}
                  </Link>
                ))}
                <Link href="/shop" className="px-3 py-2 rounded-lg text-gold-dark font-medium hover:bg-ivory col-span-2">View all designs →</Link>
              </div>
            </div>
          </div>
          <Link href="/shop?sort=new" className="nav-link py-2">New Arrivals</Link>
          <Link href="/shop?sort=bestseller" className="nav-link py-2">Bestsellers</Link>
          <Link href="/shop#gifting" className="nav-link py-2">Gifting</Link>
          <Link href="/reels" className="nav-link py-2">Reels</Link>
          <Link href="/wholesale" className="nav-link py-2 text-wine font-medium">Wholesale</Link>
        </div>
      </nav>
    </header>
  );
}
