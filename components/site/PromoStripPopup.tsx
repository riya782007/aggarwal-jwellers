"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Promo = { id: string; title?: string | null; headline?: string | null; image_path?: string | null; cta_href?: string | null; coupon_code?: string | null; ends_at?: string | null };

/** Storefront announcement STRIP (top) — first live strip-placement promotion, with an
 *  optional countdown to ends_at and a coupon code chip. */
export function PromoStrip({ promo }: { promo: Promo | null }) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    if (!promo?.ends_at) return;
    const tick = () => {
      const ms = new Date(promo.ends_at as string).getTime() - Date.now();
      if (ms <= 0) { setLeft(null); return; }
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
      setLeft(h >= 48 ? `${Math.floor(h / 24)} days left` : `${h}h ${m}m left`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [promo?.ends_at]);
  if (!promo) return null;
  return (
    <Link href={promo.cta_href || "/shop"} className="block bg-ink text-cream text-center text-sm py-2 px-4 hover:bg-ink/90">
      <span className="font-medium">{promo.headline || promo.title || "Festive offer live now"}</span>
      {promo.coupon_code && <span className="ml-2 font-mono text-gold-light bg-white/10 rounded px-1.5 py-0.5 text-xs">CODE: {promo.coupon_code}</span>}
      {left && <span className="ml-2 text-gold-light text-xs">⏳ {left}</span>}
    </Link>
  );
}

/** Storefront POPUP — first live popup-placement promotion; shows once per session. */
export function PromoPopup({ promo }: { promo: Promo | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!promo) return;
    try {
      const k = `aj_popup_${promo.id}`;
      if (sessionStorage.getItem(k)) return;
      const t = setTimeout(() => { setOpen(true); sessionStorage.setItem(k, "1"); }, 2500);
      return () => clearTimeout(t);
    } catch { /* private mode */ }
  }, [promo]);
  if (!promo || !open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-3xl overflow-hidden shadow-luxe max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {promo.image_path && <img src={promo.image_path} alt={promo.title ?? ""} className="w-full aspect-square object-cover" />}
        <div className="p-5 text-center">
          <p className="font-display text-2xl text-ink">{promo.headline || promo.title}</p>
          {promo.coupon_code && <p className="mt-2 text-sm">Use code <span className="font-mono font-semibold bg-gold/15 text-gold-dark rounded px-2 py-0.5">{promo.coupon_code}</span> at checkout</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-ink/5 text-ink text-sm">Not now</button>
            <Link href={promo.cta_href || "/shop"} onClick={() => setOpen(false)} className="flex-1 btn-primary px-4 py-2.5 text-sm font-medium text-center">Shop the offer →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
