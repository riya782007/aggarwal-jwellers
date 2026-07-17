export const dynamic = "force-dynamic";
import { getPricingFormula } from "@/lib/supabase/queries";
import { getSession, can } from "@/lib/auth";
import { saveWholesaleTiersAction, savePricingFormulaAction } from "@/app/actions/catalog";
import PricingFormulaEditor from "@/components/admin/PricingFormulaEditor";

export const metadata = { title: "Owner Console · Pricing formula" };

export default async function PricingPage() {
  const canEdit = can(getSession(), "catalog.price_edit");
  const formula = await getPricingFormula();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Pricing formula</h1>
        <p className="mt-1 text-stone-500">
          The <b>base wholesale price</b> you enter on each product is the only pricing input — this formula
          builds the Retail selling price and the MRP from it, exactly like your costing sheet. Purchase-bill
          prices are reference-only and never affect pricing.
        </p>
      </header>

      {canEdit && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="font-semibold text-stone-900">Wholesale quantity-break tiers</h2>
          <p className="mt-1 text-sm text-stone-500 mb-4">Automatic % off per LINE on trade-portal orders when a dealer buys in bulk — e.g. 12+ pcs → 5%, 50+ → 10%. Applied server-side at billing; the invoice shows the discount per line. Leave rows blank to disable.</p>
          <form action={saveWholesaleTiersAction} className="space-y-2">
            {[1, 2, 3].map((i) => {
              const t = (Array.isArray((formula as any).wholesaleTiers) ? (formula as any).wholesaleTiers : [])[i - 1] as any;
              return (
                <div key={i} className="flex items-center gap-3 text-[15px]">
                  <span className="text-stone-500 w-12">Tier {i}</span>
                  <input name={`tier_min_${i}`} type="number" min="2" placeholder="Min qty" defaultValue={t?.min_qty ?? ""} className="w-28 h-11 rounded-lg border border-stone-300 px-3 text-[15px]" />
                  <span className="text-stone-500">pcs →</span>
                  <input name={`tier_pct_${i}`} type="number" min="0" max="50" step="0.5" placeholder="% off" defaultValue={t?.pct_off ?? ""} className="w-24 h-11 rounded-lg border border-stone-300 px-3 text-[15px]" />
                  <span className="text-stone-500">% off that line</span>
                </div>
              );
            })}
            <button className="mt-2 rounded-lg bg-stone-900 px-5 py-3 text-[15px] font-medium text-white">Save tiers</button>
          </form>
        </div>
      )}

      {canEdit ? (
        <PricingFormulaEditor initial={formula} action={savePricingFormulaAction} />
      ) : (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-stone-600">
          You don't have permission to edit pricing. Ask the owner for the <code>catalog.price_edit</code> role.
        </div>
      )}
    </div>
  );
}
