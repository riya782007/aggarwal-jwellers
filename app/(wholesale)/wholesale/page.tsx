export const dynamic = "force-dynamic";
import Link from "next/link";
import { getPublishedProducts, getPricingFormula } from "@/lib/supabase/queries";
import { computePrices, formatPaise } from "@/lib/pricing";
import { ProductImage } from "@/components/Placeholder";

// MOQ + variant-collapse are configurable rules (Req 4.4 / yogendra.pdf §9).
const MOQ = 6;
const COLLAPSE_VARIANTS = true;

export const metadata = { title: "Wholesale — Trade Pricing" };

export default async function Wholesale({ searchParams }: { searchParams: { approved?: string } }) {
  const approved = searchParams.approved === "1";
  const [products, formula] = await Promise.all([getPublishedProducts(), getPricingFormula()]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-diva-gold tracking-[0.3em] text-xs uppercase">Blythe Diva · Trade</p>
          <h1 className="font-serif text-4xl text-diva-ink">Wholesale Catalogue</h1>
          <p className="text-diva-ink/60 mt-1">Trade rates · MOQ {MOQ} pcs · live stock {COLLAPSE_VARIANTS ? "· colours collapsed per SKU" : ""}</p>
        </div>
        <Link href="/admin/dashboard" className="text-sm text-diva-rose underline">Owner console ↗</Link>
      </header>

      {!approved && (
        <div className="mb-6 rounded-2xl bg-diva-ink text-white p-6 flex items-center justify-between">
          <div>
            <p className="font-medium">Wholesale pricing is for approved retailers.</p>
            <p className="text-white/70 text-sm">The owner approves each account before trade rates unlock (Req 4.5).</p>
          </div>
          <Link href="/wholesale?approved=1" className="px-5 py-2.5 rounded-full bg-diva-gold text-diva-ink font-medium text-sm">Enter as approved retailer (demo)</Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-diva-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-diva-cream text-diva-ink/60 text-left">
            <tr>
              <th className="p-3">Design</th><th className="p-3">SKU</th><th className="p-3">Category</th>
              <th className="p-3">Stock</th><th className="p-3">MOQ</th><th className="p-3">Wholesale rate</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const w = computePrices(p.base_wholesale, formula);
              return (
                <tr key={p.id} className="border-t border-diva-ink/5">
                  <td className="p-2"><div className="flex items-center gap-3"><div className="w-10 h-12 rounded overflow-hidden"><ProductImage name={p.name} /></div><span className="text-diva-ink">{p.name}</span></div></td>
                  <td className="p-3 text-diva-ink/60">{p.sku}{!COLLAPSE_VARIANTS && p.type === "configurable" ? " (+colours)" : ""}</td>
                  <td className="p-3 text-diva-ink/60">{p.category.name}</td>
                  <td className="p-3">{p.qty} pcs</td>
                  <td className="p-3">{MOQ}</td>
                  <td className="p-3 font-semibold">{approved ? formatPaise(w.wholesaleRate) : <span className="text-diva-ink/30">🔒 approval needed</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
