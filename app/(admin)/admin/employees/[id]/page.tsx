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
const inp = "rounded-lg border border-sand px-2.5 py-1.5 text-sm bg-white outline-none focus:border-emerald";

/** Resolve ?period= (+ optional from/to for custom) to an ISO date range. */
function rangeFor(period: string, from?: string, to?: string): { from?: string; to?: string; label: string } {
  const now = new Date();
  if (period === "all") return { label: "All time" };
  if (period === "7d") return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), label: "Last 7 days" };
  if (period === "30d") return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), label: "Last 30 days" };
  if (period === "custom") {
    const f = from ? new Date(from + "T00:00:00").toISOString() : undefined;
    const t = to ? new Date(to + "T23:59:59").toISOString() : undefined;
    return { from: f, to: t, label: `${from || "…"} → ${to || "…"}` };
  }
  const f = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return { from: f, label: now.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) };
}

export default async function EmployeeDetail({ params, searchParams }: { params: { id: string }; searchParams: { period?: string; from?: string; to?: string } }) {
  const emp = await getEmployee(params.id);
  if (!emp) notFound();
  const period = searchParams.period ?? "month";
  const range = rangeFor(period, searchParams.from, searchParams.to);
  const { summary, rows } = await getEmployeeSalesDetail(params.id, range);
  const canManage = can(getSession(), "customers.manage");

  const qs = (p: string) => `/admin/employees/${params.id}?period=${p}`;
  const tab = (key: string) => `px-3 py-1 rounded-full text-xs ${period === key ? "bg-ink text-white" : "bg-white border border-sand text-muted hover:border-emerald"}`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  const Stat = ({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) => (
    <div className="bg-white rounded-xl border border-sand px-3 py-2 shadow-card">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${tone}`}><span className="sensitive">{value}</span></p>
    </div>
  );

  return (
    <main className="p-4 sm:p-5 bg-cream/40 min-h-screen">
      <Link href="/admin/employees" className="text-xs text-emerald nav-link"><Icon g="←" className="inline-block align-middle w-[1em] h-[1em]" />All employees</Link>

      {/* Header + period + custom range on one tight row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1.5 mb-3">
        <h1 className="font-display text-2xl text-ink">{emp.name}</h1>
        {emp.title && <span className="text-xs text-muted">{emp.title}</span>}
        {emp.deleted ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-sand/60 text-muted">Removed</span>
          : <span className={`text-[10px] px-2 py-0.5 rounded-full ${emp.active ? "bg-emerald-mist text-emerald-dark" : "bg-sand/60 text-muted"}`}>{emp.active ? "Active" : "Inactive"}</span>}
        {emp.phone && <span className="text-xs text-muted">· {emp.phone}</span>}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <Link href={qs("7d")} className={tab("7d")}>7 days</Link>
          <Link href={qs("month")} className={tab("month")}>This month</Link>
          <Link href={qs("30d")} className={tab("30d")}>30 days</Link>
          <Link href={qs("all")} className={tab("all")}>All time</Link>
          <form action={`/admin/employees/${params.id}`} className="flex items-center gap-1.5">
            <input type="hidden" name="period" value="custom" />
            <input type="date" name="from" defaultValue={searchParams.from ?? ""} className={inp} title="From" />
            <span className="text-muted text-xs">–</span>
            <input type="date" name="to" defaultValue={searchParams.to ?? ""} className={inp} title="To" />
            <button className={tab("custom")}>Apply</button>
          </form>
        </div>
      </div>
      <p className="text-[11px] text-muted mb-3">Showing <b className="text-ink">{range.label}</b></p>

      {/* Compact stat strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        <Stat label="Bills" value={String(summary.bills)} />
        <Stat label="Sales" value={formatPaise(summary.sales)} />
        <Stat label="Collected" value={formatPaise(summary.collected)} tone="text-emerald-dark" />
        <Stat label="Pieces sold" value={String(summary.items)} />
        <Stat label="Avg bill" value={formatPaise(summary.avg)} />
      </div>

      {/* Bills */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted text-left text-[11px] uppercase tracking-wide">
            <tr><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Paid</th></tr>
          </thead>
          <tbody className="divide-y divide-sand/60">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No bills in this period.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5"><Link href={`/admin/invoice/${r.id}`} className="text-emerald nav-link">{r.invoiceNo || String(r.id).slice(0, 6).toUpperCase()} <Icon g="↗" className="inline-block align-middle w-[1em] h-[1em]" /></Link></td>
                <td className="px-3 py-1.5 text-muted">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-1.5 text-ink">{r.customer || "Walk-in"}</td>
                <td className="px-3 py-1.5 text-muted">{r.billType === "gst" ? "GST" : "Estimate"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium"><span className="sensitive">{formatPaise(r.total)}</span></td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-dark"><span className="sensitive">{formatPaise(r.paid)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manage — compact edit row + remove */}
      {canManage && !emp.deleted && (
        <div className="bg-white rounded-xl border border-sand p-4 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <form action={upsertEmployeeAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={emp.id} />
              <label className="text-[10px] text-muted">Name<input name="name" required defaultValue={emp.name} className={`${inp} block mt-0.5 w-40`} /></label>
              <label className="text-[10px] text-muted">Phone<input name="phone" defaultValue={emp.phone ?? ""} className={`${inp} block mt-0.5 w-32`} /></label>
              <label className="text-[10px] text-muted">Role<input name="title" defaultValue={emp.title ?? ""} className={`${inp} block mt-0.5 w-36`} /></label>
              <label className="flex items-center gap-1.5 text-xs text-ink pb-1.5"><input type="checkbox" name="active" defaultChecked={emp.active} className="accent-emerald" /> Active</label>
              <button className="btn-primary px-4 py-1.5 text-sm font-medium">Save</button>
            </form>
            <form action={deleteEmployeeAction}>
              <input type="hidden" name="id" value={emp.id} />
              <ConfirmSubmit message={`Remove ${emp.name}? If they have past bills, the record is kept (history preserved); otherwise it's deleted.`} className="px-3 py-1.5 rounded-full bg-rose/10 text-rose text-sm font-medium hover:bg-rose/20"><Icon g="🗑" className="inline-block align-middle w-[1em] h-[1em]" />Remove</ConfirmSubmit>
            </form>
          </div>
          <p className="text-[10px] text-muted mt-2">“Active” shows them in the POS “Sold by” picker. Remove takes them off the roster; if they have past bills the record is kept so history stays attributed.</p>
        </div>
      )}
    </main>
  );
}
