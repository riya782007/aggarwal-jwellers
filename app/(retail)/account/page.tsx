export const dynamic = "force-dynamic";
import { waHref } from "@/lib/business";
import Link from "next/link";
import { getOrder } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { Back } from "@/components/site/Back";
import { TrackForm } from "@/components/site/TrackForm";
import { OrderTimeline } from "@/components/site/OrderTimeline";

export const metadata = { title: "Track Your Order", robots: { index: false } };

export default async function Account({ searchParams }: { searchParams: { order?: string } }) {
  const id = searchParams.order?.trim();
  const data = id ? await getOrder(id) : null;

  return (
    <div className="max-w-xl mx-auto px-5 py-12">
      <div className="mb-5"><Back label="Back" /></div>
      <h1 className="font-display text-4xl text-ink mb-1">Track Your Order</h1>

      {!id && (
        <>
          <p className="text-muted mb-6">Enter your order ID (from your confirmation) to see its status.</p>
          <TrackForm />
        </>
      )}

      {id && !data && (
        <div className="bg-white rounded-2xl shadow-card p-6 mt-4">
          <p className="text-ink">We couldn&apos;t find an order with that ID.</p>
          <p className="text-sm text-muted mt-1">Double-check it, or <a href={waHref("Namaste! I need help with my Aggarwal Jewellers order.")} className="text-emerald nav-link">WhatsApp us</a> and we&apos;ll help.</p>
          <div className="mt-4"><TrackForm /></div>
        </div>
      )}

      {data && (
        <div className="mt-2">
          <p className="text-muted mb-5">Order <span className="font-mono text-ink">{String(data.order.id).slice(0, 8).toUpperCase()}</span> · {new Date(data.order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
          <div className="bg-white rounded-2xl p-6 shadow-card"><OrderTimeline /></div>
          <div className="bg-white rounded-2xl p-6 shadow-card mt-4">
            <h2 className="font-medium text-ink mb-3">Items</h2>
            <div className="space-y-2">
              {data.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between text-sm"><span className="text-ink/80">{it.product?.name} <span className="text-muted">× {it.qty}</span></span><span className="text-ink">{formatPaise(it.line_total)}</span></div>
              ))}
            </div>
            <div className="border-t border-sand mt-3 pt-3 flex justify-between font-semibold text-ink"><span>Total ({String(data.order.payment_mode).toUpperCase()})</span><span>{formatPaise(data.order.total)}</span></div>
          </div>
          <div className="text-center mt-6"><Link href="/shop" className="btn-primary inline-block px-7 py-3 text-sm font-medium">Continue shopping</Link></div>
        </div>
      )}
    </div>
  );
}
