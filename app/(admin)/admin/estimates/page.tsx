export const dynamic = "force-dynamic";
import { getEstimates, getStorefront } from "@/lib/supabase/queries";
import { liveOffer } from "@/lib/offers";
import { formatPaise } from "@/lib/pricing";
import { EstimateClient } from "@/components/admin/EstimateClient";
import { convertEstimateAction } from "@/app/actions/billing";

export const metadata = { title: "Owner Console · Estimates" };

export default async function Estimates() {
  const [{ products, formula }, estimates] = await Promise.all([getStorefront(), getEstimates()]);
  const list = products.map((p) => ({ sku: p.sku, name: p.name, price: liveOffer(p.base_wholesale, formula).price }));

  return (
    <main className="p-8 bg-cream/40 min-h-screen max-w-4xl">
      <h1 className="font-display text-4xl text-ink mb-1">Estimates &amp; Quotations</h1>
      <p className="text-sm text-muted mb-6">Quote a customer now; convert to an order (and decrement stock) only when they buy.</p>
      <EstimateClient products={list} />

      <h2 className="font-medium text-ink mb-3">Saved estimates</h2>
      <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted text-left"><tr><th className="p-3">Ref</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {estimates.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">No estimates yet.</td></tr>}
            {estimates.map((e: any) => (
              <tr key={e.id} className="border-t border-sand/60">
                <td className="p-3 text-muted">{String(e.id).slice(0, 8).toUpperCase()}</td>
                <td className="p-3 text-ink">{e.customer_name || "—"}</td>
                <td className="p-3 font-medium">{formatPaise(e.total)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${e.status === "converted" ? "bg-emerald-mist text-emerald-dark" : "bg-gold/15 text-gold-dark"}`}>{e.status}</span></td>
                <td className="p-3 text-right">{e.status === "open" && (
                  <form action={convertEstimateAction}><input type="hidden" name="id" value={e.id} /><button className="px-3 py-1.5 rounded-full bg-emerald/10 text-emerald text-xs font-medium hover:bg-emerald/20">Convert to order →</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
