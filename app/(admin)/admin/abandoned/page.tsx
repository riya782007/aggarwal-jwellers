export const dynamic = "force-dynamic";
import { getAbandonedCarts } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";

export const metadata = { title: "Owner Console · Abandoned Carts" };
const ago = (d: string) => { const h = Math.round((Date.now() - new Date(d).getTime()) / 3600000); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

export default async function Abandoned() {
  const carts = await getAbandonedCarts();
  const recoverable = carts.reduce((s: number, c: any) => s + (c.total ?? 0), 0);
  return (
    <main className="p-8 bg-cream/40 min-h-screen max-w-4xl">
      <h1 className="font-display text-4xl text-ink mb-1">Abandoned Carts</h1>
      <p className="text-sm text-muted mb-6">Shoppers who added to bag but didn&apos;t buy. <span className="text-emerald font-medium">{formatPaise(recoverable)}</span> recoverable — nudge them on WhatsApp.</p>

      <div className="space-y-3">
        {carts.length === 0 && <p className="text-sm text-muted">No abandoned carts.</p>}
        {carts.map((c: any) => {
          const items = (c.items ?? []) as { name: string; qty: number; price: number }[];
          const wa = c.phone ? `https://wa.me/${String(c.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${c.customer_name || "there"}! You left some beautiful pieces in your Aggarwal Jwellers bag. Complete your order and enjoy 20% off ✨`)}` : null;
          return (
            <div key={c.id} className="bg-white rounded-2xl p-5 shadow-card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{c.customer_name || "Anonymous visitor"} <span className="text-xs text-muted">· {ago(c.created_at)}</span></p>
                <p className="text-sm text-muted truncate">{items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-ink">{formatPaise(c.total)}</p>
                {wa ? <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald nav-link">WhatsApp nudge →</a> : <span className="text-xs text-muted">no contact</span>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
