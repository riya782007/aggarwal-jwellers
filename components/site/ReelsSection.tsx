import Link from "next/link";
import { ProductImage } from "@/components/Placeholder";
import { formatPaise } from "@/lib/pricing";
import type { ShopReel } from "@/lib/supabase/queries";

export function ReelsSection({ reels }: { reels: ShopReel[] }) {
  if (!reels.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-5 py-12">
      <div className="text-center mb-8">
        <p className="text-gold-dark tracking-[0.25em] uppercase text-xs">Watch · Tap · Buy</p>
        <h2 className="font-display text-4xl text-ink mt-1">Shop the Reels</h2>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-3 snap-x">
        {reels.map((r) => (
          <div key={r.id} className="snap-start shrink-0 w-64">
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-ink group">
              {r.video_url ? (
                <video src={r.video_url} muted loop playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: "linear-gradient(160deg,#241B2E,#0F5C4D,#C8A24C)" }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              <span className="absolute top-3 left-3 h-9 w-9 rounded-full bg-white/85 grid place-items-center text-ink">▶</span>
              <p className="absolute bottom-3 left-3 right-3 text-cream text-sm font-medium drop-shadow">{r.caption}</p>
            </div>
            <p className="text-[11px] uppercase tracking-wide text-muted mt-2 mb-1">Shop this look</p>
            <div className="flex gap-2 overflow-x-auto">
              {r.products.slice(0, 4).map((p) => (
                <Link key={p.sku} href={`/shop/${p.categorySlug}/${p.sku}`} className="shrink-0 w-20 group">
                  <div className="aspect-square rounded-lg overflow-hidden bg-cream"><ProductImage name={p.name} /></div>
                  <p className="text-[11px] font-medium text-ink mt-1">{formatPaise(p.price)}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
