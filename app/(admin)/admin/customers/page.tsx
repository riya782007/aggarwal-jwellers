export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCustomers, getRetailers } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { Pager } from "@/components/admin/Pager";

export const metadata = { title: "Owner Console · Customers (CRM)" };
const PAGE_SIZE = 20;

export default async function Customers({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const [customers, retailers] = await Promise.all([getCustomers(), getRetailers()]);
  const q = (searchParams.q ?? "").toLowerCase().trim();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const filtered = customers.filter((c: any) => !q || (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen max-w-4xl">
      <h1 className="font-display text-4xl text-ink mb-1">Customers</h1>
      <p className="text-sm text-muted mb-6">Your buyers, ranked by spend — built automatically from orders. Reach top customers first.</p>

      <div className="bg-white rounded-2xl p-6 shadow-card mb-6">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-medium text-ink">Top customers <span className="text-muted text-sm">({filtered.length})</span></h2>
          <form action="/admin/customers"><input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search name / phone…" className="rounded-full border border-sand px-4 py-1.5 text-sm outline-none focus:border-emerald w-56" /></form>
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted text-left"><tr><th className="py-1">Name</th><th className="py-1">Phone</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Spent</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="py-3 text-muted">No customers match.</td></tr>}
            {shown.map((c: any) => (
              <tr key={c.name} className="border-t border-sand/50">
                <td className="py-2 text-ink font-medium">{c.name}</td>
                <td className="py-2 text-muted">{c.phone ?? "—"}</td>
                <td className="py-2 text-right">{c.orders}</td>
                <td className="py-2 text-right font-medium text-emerald">{formatPaise(c.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager basePath="/admin/customers" params={{ q: searchParams.q }} page={page} pageSize={PAGE_SIZE} total={filtered.length} />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-card">
        <h2 className="font-medium text-ink mb-3">Wholesale retailers</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {retailers.map((r: any) => (
            <div key={r.id} className="flex justify-between border-b border-sand/50 py-2 text-sm">
              <span className="text-ink">{r.name} <span className="text-muted text-xs">· {r.city}</span></span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${r.approved ? "bg-emerald-mist text-emerald-dark" : "bg-gold/15 text-gold-dark"}`}>{r.approved ? "approved" : "pending"}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
