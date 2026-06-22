export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstimate } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { PrintButton } from "@/components/admin/PrintButton";
import { BUSINESS, amountInWords } from "@/lib/business";

export const metadata = { title: "Estimate / Quotation" };

export default async function EstimatePrint({ params }: { params: { id: string } }) {
  const data = await getEstimate(params.id);
  if (!data) notFound();
  const { estimate, items } = data;
  const total = estimate.total as number;
  const ref = "EST-" + String(estimate.id).slice(0, 8).toUpperCase();
  const date = new Date(estimate.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const qtyTotal = items.reduce((s: number, it: any) => s + it.qty, 0);
  const th = "py-2 px-2 text-xs font-semibold text-ink/70";
  const td = "py-2 px-2 align-top";

  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link href="/admin/estimates" className="text-sm text-emerald nav-link">← Estimates</Link>
          <PrintButton />
        </div>

        <div className="print-area bg-white rounded-2xl shadow-card p-5 sm:p-8 text-[13px]" id="estimate">
          <div className="text-center pb-3 mb-3 border-b-2 border-ink/80">
            <p className="text-[15px] font-bold tracking-wide text-ink">ESTIMATE / QUOTATION</p>
            <p className="text-[10px] text-muted">This is not a tax invoice. Prices valid for 7 days.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 border border-sand rounded-lg overflow-hidden">
            <div className="p-4 border-b sm:border-b-0 sm:border-r border-sand">
              <p className="font-display text-2xl text-ink leading-none">{BUSINESS.brand}</p>
              <p className="text-xs text-muted mt-0.5">{BUSINESS.legalName}</p>
              <p className="text-xs text-muted mt-1">{BUSINESS.address}</p>
              <p className="text-xs text-muted">{BUSINESS.phone} · {BUSINESS.email}</p>
            </div>
            <div className="p-4 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted">Estimate No.</span><span className="font-medium text-ink">{ref}</span></div>
              <div className="flex justify-between"><span className="text-muted">Date</span><span className="text-ink">{date}</span></div>
              <div className="flex justify-between"><span className="text-muted">Status</span><span className="text-ink capitalize">{String(estimate.status).replace("_", " ")}</span></div>
            </div>
          </div>

          <div className="border border-t-0 border-sand rounded-b-lg p-4 -mt-px">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Prepared for</p>
            <p className="text-ink font-medium">{estimate.customer_name || "—"}</p>
            {estimate.customer_phone && <p className="text-muted text-xs">Ph: {estimate.customer_phone}</p>}
          </div>

          <table className="w-full mt-4 border border-sand">
            <thead className="bg-cream border-b border-sand">
              <tr className="text-left">
                <th className={th}>#</th><th className={th}>Description</th>
                <th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} className="border-b border-sand/60">
                  <td className={`${td} text-muted`}>{i + 1}</td>
                  <td className={`${td} text-ink`}>{it.product?.name}<span className="text-muted text-xs"> · {it.product?.sku}</span></td>
                  <td className={`${td} text-right`}>{it.qty}</td>
                  <td className={`${td} text-right`}>{formatPaise(it.unit_price)}</td>
                  <td className={`${td} text-right`}>{formatPaise(it.line_total)}</td>
                </tr>
              ))}
              <tr className="bg-cream/50 font-medium">
                <td className={td}></td><td className={`${td} text-ink`}>Total</td>
                <td className={`${td} text-right`}>{qtyTotal}</td><td className={td}></td>
                <td className={`${td} text-right`}>{formatPaise(total)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 text-xs">
            <p className="text-muted mb-1">Amount in words</p>
            <p className="text-ink font-medium">{amountInWords(total)}</p>
          </div>

          <p className="text-center text-[10px] text-muted mt-6 border-t border-sand pt-3">
            Estimate only — stock is reserved on confirmation. {BUSINESS.brand} · {BUSINESS.phone}
          </p>
        </div>
      </div>
    </main>
  );
}
