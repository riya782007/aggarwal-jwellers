export const dynamic = "force-dynamic";
import { TableSearch } from "@/components/admin/TableSearch";
import Link from "next/link";
import { getWebsiteOrders } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { orderGrandPaise, isDeadOrder } from "@/lib/business";
import { getSession, can } from "@/lib/auth";
import { acceptOrderAction, rejectOrderAction, dispatchOrderAction, deliverOrderAction } from "@/app/actions/fulfillment";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { SubmitOnce } from "@/components/admin/SubmitOnce";

export const metadata = { title: "Owner Console · Website Orders" };

const TABS = [
  { key: "new", label: "🔔 New — needs a decision" },
  { key: "accepted", label: "Being prepared" },
  { key: "dispatched", label: "On the way" },
  { key: "all", label: "All website orders" },
] as const;

const waLink = (phone?: string | null, msg = "") => {
  const d = (phone ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}?text=${encodeURIComponent(msg)}` : "";
};

export default async function WebsiteOrders({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? "new") as (typeof TABS)[number]["key"];
  const rows = await getWebsiteOrders(tab);
  const session = getSession();
  const canSell = can(session, "billing.sell");
  const canRefund = can(session, "billing.refund");

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Website Orders</h1>
      <p className="text-sm text-muted mb-5">Orders placed on the storefront &amp; trade portal. Accept to start preparing (customer gets a WhatsApp), reject to cancel — stock and money reverse automatically. Delivering a COD order records the cash collected.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/orders?tab=${t.key}`}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === t.key ? "bg-ink text-white" : "bg-white text-muted hover:text-ink border border-sand"}`}>{t.label}</Link>
        ))}
      </div>

      <div className="mb-3"><TableSearch targetId="orders-list" placeholder="Search orders — customer, phone, order no…" /></div>

      <div id="orders-list" className="space-y-3">
        {rows.length === 0 && <div className="bg-white rounded-2xl p-8 shadow-card text-center text-muted">Nothing here right now. 🎉</div>}
        {rows.map((o: any) => {
          const grand = orderGrandPaise(o);
          const dead = isDeadOrder(o.status);
          const stage = dead ? (o.fulfillment === "rejected" ? "Rejected" : "Cancelled")
            : o.delivered_at ? "Delivered" : o.dispatched_at ? "Dispatched"
            : o.fulfillment === "accepted" ? "Preparing" : "New";
          return (
            <div key={o.id} className={`bg-white rounded-2xl p-5 shadow-card ${stage === "New" ? "border border-gold/50" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/invoice/${o.id}`} className="font-mono text-sm text-emerald nav-link">{String(o.id).slice(0, 8).toUpperCase()}</Link>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${o.channel === "wholesale" ? "bg-gold/15 text-gold-dark" : "bg-emerald-mist text-emerald-dark"}`}>{o.channel}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${o.payment_mode === "cod" ? "bg-wine/10 text-wine" : "bg-ink/5 text-ink"}`}>{o.payment_mode === "cod" ? "COD — collect on delivery" : "Prepaid"}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${dead ? "bg-rose/10 text-rose" : stage === "New" ? "bg-gold/15 text-gold-dark" : "bg-emerald-mist text-emerald-dark"}`}>{stage}</span>
                  </div>
                  <p className="text-ink mt-1.5">{o.customer_name || "Customer"}{o.customer_phone && <span className="text-muted"> · {o.customer_phone}</span>}</p>
                  {(o.customer?.address || o.customer?.city) && <p className="text-xs text-muted mt-0.5">📍 {[o.customer?.address, o.customer?.city].filter(Boolean).join(", ")}</p>}
                  <p className="text-xs text-muted mt-0.5">{o.itemCount} pc(s) · {new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-semibold text-ink">{formatPaise(grand)}</p>
                  {waLink(o.customer_phone) && <a href={waLink(o.customer_phone, `Namaste ${o.customer_name ?? ""}! About your Aggarwal Jewellers order ${String(o.id).slice(0, 8).toUpperCase()}…`)} target="_blank" className="text-xs text-emerald nav-link">WhatsApp customer ↗</a>}
                </div>
              </div>

              {!dead && (
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-sand/60">
                  {stage === "New" && canSell && (
                    <form action={acceptOrderAction}><input type="hidden" name="order_id" value={o.id} />
                      <SubmitOnce className="px-4 py-2 rounded-full bg-emerald text-white text-sm font-medium hover:bg-emerald-dark">✓ Accept order</SubmitOnce>
                    </form>
                  )}
                  {stage === "New" && canRefund && (
                    <form action={rejectOrderAction} className="flex items-center gap-2">
                      <input type="hidden" name="order_id" value={o.id} />
                      <input name="reason" placeholder="Reason" className="rounded-xl border border-sand px-3 py-1.5 text-xs outline-none focus:border-emerald w-36" />
                      <ConfirmSubmit message="Reject this order? It will be cancelled — stock restored and any payment reversed." className="px-4 py-2 rounded-full bg-rose/10 text-rose text-sm font-medium hover:bg-rose/20">✗ Reject</ConfirmSubmit>
                    </form>
                  )}
                  {stage === "Preparing" && canSell && (
                    <form action={dispatchOrderAction}><input type="hidden" name="order_id" value={o.id} />
                      <SubmitOnce className="px-4 py-2 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink/90">📦 Mark dispatched</SubmitOnce>
                    </form>
                  )}
                  {stage === "Dispatched" && canSell && (
                    <form action={deliverOrderAction}><input type="hidden" name="order_id" value={o.id} />
                      <ConfirmSubmit message={o.payment_mode === "cod" ? "Mark delivered? The COD amount due will be recorded as cash collected." : "Mark delivered?"} className="px-4 py-2 rounded-full bg-emerald text-white text-sm font-medium hover:bg-emerald-dark">✅ Mark delivered{o.payment_mode === "cod" ? " + collect COD" : ""}</ConfirmSubmit>
                    </form>
                  )}
                  <Link href={`/admin/invoice/${o.id}`} className="ml-auto text-xs text-muted hover:text-ink">Open bill →</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
