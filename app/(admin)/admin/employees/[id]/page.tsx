export const dynamic = "force-dynamic";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmployee, getEmployeeSalesDetail } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { getSession, can } from "@/lib/auth";
import { upsertEmployeeAction, deleteEmployeeAction } from "@/app/actions/employees";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";

export const metadata = { title: "Owner Console · Employee" };
const card = "bg-white rounded-2xl border border-sand p-5 shadow-card";
const inp = "rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

/** Resolve ?period= (+ optional from/to for custom) to an ISO date range. */
function rangeFor(period: string, from?: string, to?: string): { from?: string; to?: string; label: string } {
  const now = new Date();
  if (period === "all") return { label: "All time" };
  if (period === "7d") return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), label: "Last 7 days" };
  if (period === "30d") return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), label: "Last 30 days" };
  if (period === "custom") {
    const f = from ? new Date(from + "T00:00:00").toISOString() : undefined;
    const t = to ? new Date(to + "T23:59:59").toISOString() : undefined;
    const label = `${from || "…"} → ${to || "…"}`;
    return { from: f, to: t, label };
  }
  const f = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return { from: f, label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

export default async function EmployeeDetail({ params, searchParams }: { params: { id: string }; searchParams: { period?: string; from?: string; to?: string } }) {
  const emp = await getEmployee(params.id);
  if (!emp) notFound();
  const period = searchParams.period ?? "month";
  const range = rangeFor(period, searchParams.from, searchParams.to);
  const { summary, rows } = await getEmployeeSalesDetail(params.id, range);
  const canManage = can(getSession(), "customers.manage");

  const qs = (p: string) => `/admin/employees/${params.id}?period=${p}`;
  const tab = (key: string) => `px-3.5 py-1.5 rounded-full text-sm ${period === key ? "bg-ink text-white" : "bg-white border border-sand text-muted hover:border-emerald"}`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <Link href="/admin/employees" className="text-sm text-emerald nav-link"><Icon g="←" className="inline-block align-middle w-[1em] h-[1em]" />All employees</Link>
      <div className="flex flex-wrap items-baseline gap-3 mt-2 mb-1">
        <h1 className="font-display text-4xl text-ink">{emp.name}</h1>
        {emp.title && <span className="text-sm text-muted">{emp.title}</span>}
        {emp.deleted ? <span className="text-xs px-2.5 py-0.5 rounded-full bg-sand/60 text-muted">Removed</span>
          : <span className={`text-xs px-2.5 py-0.5 rounded-full ${emp.active ? "bg-emerald-mist text-emerald-dark" : "bg-sand/60 text-muted"}`}>{emp.active ? "Active" : "Inactive"}</span>}
      </div>
      <p className="text-sm text-muted mb-5">{emp.phone || "No phone"} · Sales attributed to this person over the chosen period.</p>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-wide text-muted mr-1">Period</span>
        <Link href={qs("7d")} className={tab("7d")}>Last 7 days</Link>
        <Link href={qs("month")} className={tab("month")}>This month</Link>
        <Link href={qs("30d")} className={tab("30d")}>Last 30 days</Link>
        <Link href={qs("all")} className={tab("all")}>All time</Link>
      </div>
      {/* Custom range */}
      <form action={`/admin/employees/${params.id}`} className={`${card} mb-5 flex flex-wrap items-end gap-3`}>
        <input type="hidden" name="period" value="custom" />
        <label className="text-[11px] text-muted">From<input type="date" name="from" defaultValue={searchParams.from ?? ""} className={`${inp} block mt-0.5`} /></label>
        <label className="text-[11px] text-muted">To<input type="date" name="to" defaultValue={searchParams.to ?? ""} className={`${inp} block mt-0.5`} /></label>
        <button className="px-4 py-2 rounded-xl bg-ink text-white text-sm">Apply custom range</button>
        <span className="text-sm text-muted ml-auto">Showing: <b className="text-ink">{range.label}</b></span>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className={card}><p className="text-xs uppercase tracking-wide text-muted">Bills</p><p className="text-2xl font-semibold text-ink mt-1">{summary.bills}</p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-muted">Sales</p><p className="text-2xl font-semibold text-ink mt-1"><span className="sensitive">{formatPaise(summary.sales)}</span></p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-muted">Collected</p><p className="text-2xl font-semibold text-emerald-dark mt-1"><span className="sensitive">{formatPaise(summary.collected)}</span></p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-muted">Pieces sold</p><p className="text-2xl font-semibold text-ink mt-1">{summary.items}</p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-muted">Avg bill</p><p className="text-2xl font-semibold text-ink mt-1"><span className="sensitive">{formatPaise(summary.avg)}</span></p></div>
      </div>

      {/* Bills list */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted text-left text-xs uppercase tracking-wide">
            <tr><th className="px-4 py-2.5">Bill</th><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Paid</th></tr>
          </thead>
          <tbody className="divide-y divide-sand/60">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No bills in this period.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5"><Link href={`/admin/invoice/${r.id}`} className="text-emerald nav-link">{r.invoiceNo || String(r.id).slice(0, 6).toUpperCase()} <Icon g="↗" className="inline-block align-middle w-[1em] h-[1em]" /></Link></td>
                <td className="px-4 py-2.5 text-muted">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-2.5 text-ink">{r.customer || "Walk-in"}</td>
                <td className="px-4 py-2.5 text-muted">{r.billType === "gst" ? "GST" : "Estimate"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium"><span className="sensitive">{formatPaise(r.total)}</span></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-dark"><span className="sensitive">{formatPaise(r.paid)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manage — edit details + remove */}
      {canManage && !emp.deleted && (
        <div className="grid md:grid-cols-2 gap-4">
          <form action={upsertEmployeeAction} className={card}>
            <h2 className="font-medium text-ink mb-3">Edit details</h2>
            <input type="hidden" name="id" value={emp.id} />
            <div className="space-y-2">
              <label className="text-[11px] text-muted block">Name<input name="name" required defaultValue={emp.name} className={`${inp} block mt-0.5 w-full`} /></label>
              <label className="text-[11px] text-muted block">Phone<input name="phone" defaultValue={emp.phone ?? ""} className={`${inp} block mt-0.5 w-full`} /></label>
              <label className="text-[11px] text-muted block">Role / title<input name="title" defaultValue={emp.title ?? ""} className={`${inp} block mt-0.5 w-full`} /></label>
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="active" defaultChecked={emp.active} className="accent-emerald" /> Active (shows in the POS “Sold by” picker)</label>
            </div>
            <button className="btn-primary px-5 py-2 text-sm font-medium mt-3">Save changes</button>
          </form>

          <div className={`${card} border-rose/20`}>
            <h2 className="font-medium text-ink mb-1">Remove employee</h2>
            <p className="text-xs text-muted mb-3">Takes them off the roster and the POS picker. If they have past bills, the record is kept so those bills stay attributed to them — no sales history is lost.</p>
            <form action={deleteEmployeeAction}>
              <input type="hidden" name="id" value={emp.id} />
              <ConfirmSubmit message={`Remove ${emp.name}? If they have past bills, the record is kept (history preserved); otherwise it's deleted.`} className="px-4 py-2 rounded-full bg-rose/10 text-rose text-sm font-medium hover:bg-rose/20"><Icon g="🗑" className="inline-block align-middle w-[1em] h-[1em]" />Remove</ConfirmSubmit>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
