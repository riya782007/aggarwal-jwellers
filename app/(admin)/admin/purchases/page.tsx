import { Icon } from "@/components/ui/Icon";
export const dynamic = "force-dynamic";
import { getSuppliers, getProductsForPurchase, getRecentPurchases, getLastPurchaseCosts, getCategoryTree } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { PurchaseClient } from "@/components/admin/PurchaseClient";
import { createSupplierAction } from "@/app/actions/purchases";
import { BulkPurchasePaste } from "@/components/admin/BulkPurchasePaste";
import { TableSearch } from "@/components/admin/TableSearch";

export const metadata = { title: "Owner Console · Purchases" };

export default async function Purchases({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const from = searchParams.from ? searchParams.from + "T00:00:00+05:30" : undefined;
  const to = searchParams.to ? searchParams.to + "T23:59:59+05:30" : undefined;
  const [suppliers, products, purchases, lastCosts, tree] = await Promise.all([getSuppliers(), getProductsForPurchase(), getRecentPurchases({ from, to, limit: (from || to) ? 1000 : 15 }), getLastPurchaseCosts(), getCategoryTree().catch(() => [] as any[])]);
  // Category + subcategory master, so a purchase line can create a brand-new product on the spot.
  const categories = (tree as any[]).map((c) => ({ id: c.id, name: c.name }));
  const subcategories = (tree as any[]).flatMap((c) => ((c.subcategories ?? []) as any[]).map((s) => ({ id: s.id, name: s.name, categoryId: c.id })));
  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Purchases</h1>
      <p className="text-sm text-muted mb-6">Record supplier bills by city. Mapped items add to stock; the purchase ledger updates automatically. New designs can be created right on a line — start selling on the counter at once.</p>
      {(searchParams.from || searchParams.to) && <p className="text-sm text-emerald-dark mb-4">Showing purchase bills for the selected dashboard period.</p>}

      <PurchaseClient suppliers={suppliers} products={products} lastCosts={lastCosts} categories={categories} subcategories={subcategories} />

      {/* 0049 — paste the whole paper bill in one go */}
      <BulkPurchasePaste suppliers={suppliers as any} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-card">
          <h2 className="font-medium text-ink mb-3">Add supplier</h2>
          <form action={createSupplierAction} className="space-y-2">
            <input name="name" placeholder="Supplier name" className="w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald" />
            <input name="city" placeholder="City (e.g. Mumbai)" className="w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald" />
            <button className="btn-primary px-5 py-2 text-sm font-medium">Add</button>
          </form>
          <div className="mt-4 text-sm space-y-1">
            {suppliers.map((s: any) => <div key={s.id} className="flex justify-between border-b border-sand/50 py-1.5"><span className="text-ink">{s.name}</span><span className="text-muted text-xs">{s.city}</span></div>)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-medium text-ink">Recent purchases</h2>
            {purchases.length > 8 && <TableSearch targetId="purchases-table" placeholder="Search bill or supplier…" />}
          </div>
          <table id="purchases-table" className="w-full text-sm">
            <thead className="text-muted text-left"><tr><th className="py-1">Bill</th><th className="py-1">Supplier</th><th className="py-1 text-right">Total</th></tr></thead>
            <tbody>
              {purchases.length === 0 && <tr><td colSpan={3} className="py-3 text-muted">No purchases yet.</td></tr>}
              {purchases.map((p: any) => (
                <tr key={p.id} className="border-t border-sand/50">
                  <td className="py-2"><a href={`/admin/purchase/${p.id}`} className="text-emerald nav-link">{p.bill_no || String(p.id).slice(0, 6).toUpperCase()} <Icon g="↗" className="inline-block align-middle w-[1em] h-[1em]" /></a></td>
                  <td className="py-2 text-muted">{p.supplier?.name}{p.supplier?.city ? ` · ${p.supplier.city}` : ""}</td>
                  <td className="py-2 text-right font-medium"><span className="sensitive">{formatPaise(p.total)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
