export const dynamic = "force-dynamic";
import { findOrderForTracking } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { orderGrandPaise } from "@/lib/business";

export const metadata = { title: "Track your order · Aggarwal Jewellers" };

function Step({ done, active, icon, title, sub }: { done: boolean; active?: boolean; icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-base shrink-0 ${done ? "bg-emerald text-white" : active ? "bg-gold/20 text-gold-dark" : "bg-ink/5 text-muted"}`}>{icon}</div>
      <div className="pb-6">
        <p className={`text-sm font-medium ${done || active ? "text-ink" : "text-muted"}`}>{title}</p>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
    </div>
  );
}
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : undefined);

export default async function TrackOrder({ searchParams }: { searchParams: { code?: string; phone?: string } }) {
  const code = (searchParams.code ?? "").trim();
  const phone = (searchParams.phone ?? "").trim();
  const order = code && phone ? await findOrderForTracking(code, phone) : null;
  const fld = "w-full rounded-xl border border-sand bg-white px-4 py-3 text-base outline-none focus:border-emerald";

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <h1 className="font-display text-3xl text-ink mb-1">Track your order</h1>
      <p className="text-sm text-muted mb-6">Enter the order code from your confirmation (or bill) and the phone number you ordered with.</p>

      <form action="/track" className="bg-white rounded-2xl p-5 shadow-card space-y-3 mb-6">
        <input name="code" defaultValue={code} placeholder="Order code · e.g. 9F3A21BC or INV-000123" required className={fld} />
        <input name="phone" defaultValue={phone} placeholder="Phone number" inputMode="tel" required className={fld} />
        <button className="btn-primary w-full py-3 text-base font-medium">Track →</button>
      </form>

      {code && phone && !order && (
        <div className="bg-rose/10 text-rose rounded-2xl p-4 text-sm">No order found for that code + phone. Check both and try again, or WhatsApp us for help.</div>
      )}

      {order && (() => {
        const cancelled = ["cancelled", "void", "refunded"].includes(order.status);
        const accepted = order.fulfillment === "accepted" || !!order.dispatched_at || !!order.delivered_at;
        return (
          <div className="bg-white rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
              <div>
                <p className="font-mono text-sm text-muted">{order.invoice_no || String(order.id).slice(0, 8).toUpperCase()}</p>
                <p className="text-ink font-medium">{order.customer_name}</p>
              </div>
              <p className="text-xl font-semibold text-ink">{formatPaise(orderGrandPaise(order))}</p>
            </div>
            {cancelled ? (
              <div className="bg-rose/10 text-rose rounded-xl p-4 text-sm font-medium">This order was cancelled. Any payment made will be refunded — WhatsApp us with your order code for anything at all.</div>
            ) : (
              <div>
                <Step done icon="🛍" title="Order placed" sub={dt(order.created_at)} />
                <Step done={accepted} active={!accepted} icon="✓" title="Confirmed & being prepared" sub={accepted ? "We're packing your jewellery with care" : "Waiting for confirmation"} />
                <Step done={!!order.dispatched_at} active={accepted && !order.dispatched_at} icon="📦" title="Dispatched" sub={dt(order.dispatched_at)} />
                <Step done={!!order.delivered_at} active={!!order.dispatched_at && !order.delivered_at} icon="🏠" title={`Delivered${order.payment_mode === "cod" && !order.delivered_at ? " · pay cash on delivery" : ""}`} sub={dt(order.delivered_at)} />
              </div>
            )}
          </div>
        );
      })()}
    </main>
  );
}
