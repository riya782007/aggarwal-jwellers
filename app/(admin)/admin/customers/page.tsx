export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCustomersDb, getCustomers, getCreditors } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { Pager } from "@/components/admin/Pager";
import { getSession, can } from "@/lib/auth";
import { upsertCustomerAction } from "@/app/actions/customers";

export const metadata = { title: "Owner Console · Customers" };
const PAGE_SIZE = 20;
const TYPE_STYLE: Record<string, string> = { wholesale: "bg-gold/15 text-gold-dark", retail: "bg-emerald-mist text-emerald-dark" };

export default async function Customers({ searchParams }: { searchParams: { q?: string; type?: string; page?: string } }) {
  const q = searchParams.q ?? "";
  const type = searchParams.type ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [allRaw, topSpenders, creditors] = await Promise.all([
    getCustomersDb({ q, type }),
    getCustomers(),
    getCreditors(), // open-bill dues (GST-aware, dead orders excluded) — same source as the Udhaar page
  ]);
  // Outstanding = open-bill dues (by customer id or phone) + any manual ledger balance.
  const dueById = new Map<string, number>();
  const dueByPhone = new Map<string, number>();
  for (const cr of creditors) {
    if (cr.id) dueById.set(cr.id, (dueById.get(cr.id) ?? 0) + cr.outstanding);
    else if (cr.phone) dueByPhone.set(cr.phone, (dueByPhone.get(cr.phone) ?? 0) + cr.outstanding);
  }
  const all = allRaw.map((c: any) => ({
    ...c,
    outstanding: (dueById.get(c.id) ?? dueByPhone.get(c.phone ?? "") ?? 0) + (c.credit_balance ?? 0),
  }));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canManage = can(getSession(), "customers.manage");
  const sel = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";
  const fld = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald w-full";

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="font-display text-4xl text-ink">Customers</h1>
        {/* Spend targeting / rewards moved to the Promotions section — this page is just the directory. */}
        <Link href="/admin/promotions#customer-rewards" className="text-sm text-emerald nav-link whitespace-nowrap">🎯 Reward &amp; target customers →</Link>
      </div>
      <p className="text-sm text-muted mb-4">Your customer directory — retail &amp; wholesale, with GST details and dues. Click a customer for full history.</p>

      {/* Add */}
      {canManage && (
        <form action={upsertCustomerAction} className="bg-white rounded-2xl p-5 shadow-card mb-4 border border-sand">
          <h2 className="font-medium text-ink mb-3">Add customer</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input name="name" placeholder="Name / firm *" className={fld} required />
            <select name="type" defaultValue="retail" className={fld}><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select>
            <input name="phone" placeholder="Phone" className={fld} />
            <input name="gstin" placeholder="GSTIN (for B2B)" className={fld} />
            <input name="city" placeholder="City" className={fld} />
            <input name="credit_balance" type="number" placeholder="Outstanding due ₹" className={fld} />
            <input name="address" placeholder="Address" className={`${fld} sm:col-span-2`} />
            <input name="email" placeholder="Email" className={fld} />
          </div>
          <button className="btn-primary px-5 py-2.5 text-sm font-medium mt-3">Save customer</button>
        </form>
      )}

      {/* Search + filter */}
      <form action="/admin/customers" className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="Search name / phone / GSTIN…" className="h-11 rounded-xl border border-sand bg-white px-4 text-[15px] outline-none focus:border-emerald flex-1 min-w-[200px]" />
        <select name="type" defaultValue={type} className={`${sel} h-11`}><option value="all">All types</option><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select>
        <button className="h-11 px-5 rounded-xl bg-ink text-white text-sm">Filter</button>
        {(q || type !== "all") && <Link href="/admin/customers" className="h-11 grid place-items-center px-3 text-sm text-muted hover:text-ink">Clear</Link>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
        <table className="w-full text-[15px]">
          <thead className="bg-cream text-muted text-left"><tr>
            <th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Phone</th><th className="p-3">City</th><th className="p-3 text-right">Outstanding</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-muted">No customers match. {q || type !== "all" ? "Try a different search." : "Add one above, or they'll appear as you bill them."}</td></tr>}
            {rows.map((c: any) => (
              <tr key={c.id} className="border-t border-sand/60 hover:bg-cream/40">
                <td className="p-3"><Link href={`/admin/customer/${c.id}`} className="text-emerald nav-link font-medium">{c.name}</Link>{c.gstin ? <span className="block text-[11px] text-muted font-mono">{c.gstin}</span> : null}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${TYPE_STYLE[c.type] ?? "bg-cream text-muted"}`}>{c.type}</span></td>
                <td className="p-3 text-muted">{c.phone || "—"}</td>
                <td className="p-3 text-muted">{c.city || "—"}</td>
                <td className="p-3 text-right">
                  {c.outstanding > 0 ? <span className="text-rose font-medium">{formatPaise(c.outstanding)}</span>
                    : c.outstanding < 0 ? <span className="text-emerald-dark text-xs font-medium">Advance {formatPaise(-c.outstanding)}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="p-3 text-right"><Link href={`/admin/customer/${c.id}`} className="text-emerald nav-link text-xs whitespace-nowrap">Ledger →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager basePath="/admin/customers" params={{ q, type }} page={page} pageSize={PAGE_SIZE} total={all.length} />

      {/* Top spenders (all-time analytics, derived from orders) */}
      <div className="bg-white rounded-2xl p-5 shadow-card mt-6">
        <h2 className="font-medium text-ink mb-3">Top customers by spend (all time)</h2>
        <table className="w-full text-sm">
          <thead className="text-muted text-left"><tr><th className="py-1">Name</th><th className="py-1">Phone</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Spent</th></tr></thead>
          <tbody>
            {topSpenders.length === 0 && <tr><td colSpan={4} className="py-3 text-muted">No sales yet.</td></tr>}
            {topSpenders.slice(0, 10).map((c: any) => (
              <tr key={c.name} className="border-t border-sand/50">
                <td className="py-2 text-ink">{c.name}</td><td className="py-2 text-muted">{c.phone ?? "—"}</td>
                <td className="py-2 text-right">{c.orders}</td><td className="py-2 text-right font-medium text-emerald">{formatPaise(c.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
