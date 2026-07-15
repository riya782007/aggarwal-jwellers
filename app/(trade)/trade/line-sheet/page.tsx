export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStorefront } from "@/lib/supabase/queries";
import { getWholesaleSession } from "@/lib/wholesale";
import { resolvePrices, overridesOf, formatPaise } from "@/lib/pricing";
import { PrintButton } from "@/components/admin/PrintButton";
import { BUSINESS } from "@/lib/business";

export const metadata = { title: "Line Sheet · Aggarwal Jewellers Trade", robots: { index: false } };

/** Printable wholesale line sheet — dealers only (trade session required). */
export default async function LineSheet() {
  const session = await getWholesaleSession();
  if (!session) redirect("/trade/login");
  const { products, formula } = await getStorefront();
  const rows = (products as any[])
    .filter((p) => !p.retail_only)
    .map((p) => ({ sku: p.sku, name: p.name, qty: p.qty ?? 0, rate: resolvePrices(p.base_wholesale, formula, overridesOf(p)).wholesaleRate }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 print-area">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold-dark">{BUSINESS.brand} · Trade</p>
          <h1 className="font-display text-3xl text-ink">Wholesale Line Sheet</h1>
          <p className="text-xs text-muted">Rates as on {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · GST extra on tax invoice · E&OE</p>
        </div>
        <div className="no-print flex gap-2">
          <Link href="/trade" className="px-4 py-2 rounded-xl bg-ink/5 text-ink text-sm">← Portal</Link>
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted border-b border-sand"><th className="py-2">SKU</th><th className="py-2">Design</th><th className="py-2 text-right">Trade rate</th><th className="py-2 text-right">Stock</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} className="border-b border-sand/50">
              <td className="py-1.5 font-mono">{r.sku}</td>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right font-medium">{formatPaise(r.rate)}</td>
              <td className={`py-1.5 text-right ${r.qty <= 0 ? "text-rose" : "text-muted"}`}>{r.qty <= 0 ? "on order" : r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted mt-4">{BUSINESS.legalName} · {BUSINESS.address} · {BUSINESS.phone} · GSTIN {BUSINESS.gstin}</p>
    </div>
  );
}
