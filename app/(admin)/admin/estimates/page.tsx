import { Icon } from "@/components/ui/Icon";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { getEstimates, getEstimateStatusCounts, getStorefront, getCustomersDb, getEmployees } from "@/lib/supabase/queries";
import { supabaseServer } from "@/lib/supabase/server";
import { formatPaise, resolvePrices, overridesOf } from "@/lib/pricing";
import { EstimateClient } from "@/components/admin/EstimateClient";
import { billEstimateAction, denyEstimateAction, reopenEstimateAction } from "@/app/actions/billing";
import { setQuoteStatusAction } from "@/app/actions/quotes";
import { SubmitOnce } from "@/components/admin/SubmitOnce";

export const metadata = { title: "Owner Console · Estimates & Quotes" };

// Dealer rate-request helpers — quotes are merged into Estimates so "quote → bill" is one place.
const waLink = (phone: string, msg: string) => {
  const d = (phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}?text=${encodeURIComponent(msg)}` : "";
};
const qfld = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";

const TABS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "open", label: "Active", match: (s) => s === "open" },
  { key: "converted", label: "GST billed", match: (s) => s === "converted" },
  { key: "cash_billed", label: "Final estimate", match: (s) => s === "cash_billed" },
  { key: "denied", label: "Denied", match: (s) => s === "denied" || s === "expired" },
  { key: "all", label: "All history", match: () => true },
];

const STATUS_STYLE: Record<string, string> = {
  open: "bg-gold/15 text-gold-dark",
  converted: "bg-emerald-mist text-emerald-dark",
  cash_billed: "bg-blue-100 text-blue-700",
  denied: "bg-rose/15 text-rose",
  expired: "bg-cream text-muted",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Held", converted: "Converted · GST", cash_billed: "Converted · Final Estimate", denied: "Denied", expired: "Expired",
};

export default async function Estimates({ searchParams }: { searchParams: { tab?: string; q?: string; sort?: string } }) {
  const sb = supabaseServer();
  const tab = TABS.find((t) => t.key === (searchParams.tab ?? "open")) ?? TABS[0];
  const listFilter = tab.key === "all" ? {} : tab.key === "denied" ? { statuses: ["denied", "expired"] } : { status: tab.key };
  const [{ products, formula }, estimates, customers, { data: variants }, employees, statusCounts] = await Promise.all([
    getStorefront({ includeDrafts: true, includeWholesaleOnly: true }),
    getEstimates({ sort: searchParams.sort, ...listFilter }),
    getCustomersDb({}),
    sb.from("variants").select("sku,color,qty,product_id,wholesale_override,retail_override,mrp_override"),
    getEmployees({ includeDeleted: true }),
    getEstimateStatusCounts(),
  ]);
  // Expand each design into its colour VARIANTS (variant SKUs are what get billed), so the estimate
  // search shows the exact colour — e.g. "Rajwada Necklace · Green (KN132-GREEN)" — not just the parent.
  const varsByProduct = new Map<string, any[]>();
  for (const v of ((variants ?? []) as any[])) { const a = varsByProduct.get(v.product_id) ?? []; a.push(v); varsByProduct.set(v.product_id, a); }
  const list: { sku: string; name: string; price: number; wholesale: number; qty: number }[] = [];
  for (const p of products as any[]) {
    const vs = varsByProduct.get(p.id) ?? [];
    if (vs.length) {
      for (const v of vs) {
        const ps = resolvePrices(p.base_wholesale, formula, overridesOf(v), overridesOf(p));
        list.push({ sku: v.sku, name: `${p.name}${v.color ? " · " + v.color : ""}`, price: ps.retailPrice, wholesale: ps.wholesaleRate, qty: v.qty ?? 0 });
      }
    } else {
      const ps = resolvePrices(p.base_wholesale, formula, overridesOf(p));
      list.push({ sku: p.sku, name: p.name, price: ps.retailPrice, wholesale: ps.wholesaleRate, qty: p.qty ?? 0 });
    }
  }
  const custList = customers.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone ?? "", type: c.type ?? "retail", gstin: c.gstin ?? "" }));
  const empById = new Map(employees.map((e) => [e.id, e.name]));
  const activeEmps = employees.filter((e) => e.active);

  // Active dealer rate requests (new / quoted) from the trade portal, surfaced inline below.
  const { data: quoteData } = await sb.from("quote_requests").select("*").in("status", ["new", "quoted"]).order("created_at", { ascending: false }).limit(50);
  const quoteRows = (quoteData as any[]) ?? [];

  const q = (searchParams.q ?? "").toLowerCase().trim();
  const rows = estimates.filter((e: any) => !q || (e.customer_name ?? "").toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q));
  const counts: Record<string, number> = {
    open: statusCounts.open ?? 0,
    converted: statusCounts.converted ?? 0,
    cash_billed: statusCounts.cash_billed ?? 0,
    denied: (statusCounts.denied ?? 0) + (statusCounts.expired ?? 0),
    all: Object.values(statusCounts).reduce((s, n) => s + n, 0),
  };

  // Pillar 1 — sortable column headers, mirroring the sales register so A–Z by customer
  // and Ref-ID order are one click away on quotes too.
  const sort = searchParams.sort ?? "date_desc";
  const [sortField, sortDir] = sort.split("_");
  const sortHref = (field: string, firstAsc: boolean) => {
    const next = sortField === field
      ? (sortDir === "asc" ? `${field}_desc` : `${field}_asc`)
      : (firstAsc ? `${field}_asc` : `${field}_desc`);
    const sp = new URLSearchParams();
    sp.set("tab", tab.key);
    if (searchParams.q) sp.set("q", searchParams.q);
    sp.set("sort", next);
    return `/admin/estimates?${sp.toString()}`;
  };
  const arrow = (field: string) => sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Estimates &amp; Quotations</h1>
      <p className="text-sm text-muted mb-6">Quote now; bill only when the customer confirms. <b>Sold by</b> is stored on the quote and copies onto the bill automatically. Converted quotes leave the Active list (history is under GST billed / Final estimate). Dealer rate requests from the trade portal appear at the bottom.</p>
      <EstimateClient products={list} customers={custList} employees={activeEmps.map((e) => ({ id: e.id, name: e.name }))} />

      {/* tabs + search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TABS.map((t) => {
          const sp = new URLSearchParams(); sp.set("tab", t.key);
          if (searchParams.sort) sp.set("sort", searchParams.sort);
          return (
            <Link key={t.key} href={`/admin/estimates?${sp.toString()}`}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${tab.key === t.key ? "bg-ink text-white" : "bg-white border border-sand text-muted hover:border-gold"}`}>
              {t.label} <span className="opacity-60">{counts[t.key] ?? 0}</span>
            </Link>
          );
        })}
        <form className="ml-auto" action="/admin/estimates">
          <input type="hidden" name="tab" value={tab.key} />
          {searchParams.sort && <input type="hidden" name="sort" value={searchParams.sort} />}
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search customer / ref…" className="rounded-full border border-sand px-4 py-1.5 text-sm bg-white outline-none focus:border-emerald w-56" />
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted text-left"><tr>
            <th className="p-3"><Link href={sortHref("ref", true)} className="hover:text-ink">Ref <span className="opacity-60">{arrow("ref")}</span></Link></th>
            <th className="p-3"><Link href={sortHref("customer", true)} className="hover:text-ink">Customer <span className="opacity-60">{arrow("customer")}</span></Link></th>
            <th className="p-3"><Link href={sortHref("amount", false)} className="hover:text-ink">Total <span className="opacity-60">{arrow("amount")}</span></Link></th>
            <th className="p-3">Status</th>
            <th className="p-3">Sold by</th>
            <th className="p-3"><Link href={sortHref("date", false)} className="hover:text-ink">Date <span className="opacity-60">{arrow("date")}</span></Link></th>
            <th className="p-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-muted">No estimates here.</td></tr>}
            {rows.map((e: any) => (
              <tr key={e.id} className="border-t border-sand/60 align-middle">
                <td className="p-3 whitespace-nowrap"><Link href={`/admin/estimate/${e.id}`} className="text-emerald nav-link font-mono">{String(e.id).slice(0, 8).toUpperCase()}</Link></td>
                <td className="p-3 text-ink">{e.customer_name || "—"}{e.customer_phone && <span className="block text-xs text-muted">{e.customer_phone}</span>}</td>
                <td className="p-3 font-medium whitespace-nowrap">{formatPaise(e.total)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[e.status] ?? "bg-cream text-muted"}`}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
                <td className="p-3 text-muted whitespace-nowrap">{e.sales_employee_id ? (empById.get(e.sales_employee_id) ?? "—") : <span className="text-gold-dark">not set</span>}</td>
                <td className="p-3 text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5 justify-end items-center">
                    <Link href={`/admin/estimate/${e.id}`} className="px-2.5 py-1 rounded-full bg-ink/5 text-ink text-xs hover:bg-ink/10"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print</Link>
                    {e.status === "open" && <>
                      <Link href={`/admin/estimate/${e.id}#edit-estimate`} className="px-2.5 py-1 rounded-full bg-emerald-mist text-emerald-dark text-xs font-medium hover:bg-emerald/20"><Icon g="✏️" className="inline-block align-middle w-[1em] h-[1em]" />Edit</Link>
                      <form action={billEstimateAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="bill_type" value="gst" />{e.sales_employee_id && <input type="hidden" name="sales_employee_id" value={e.sales_employee_id} />}<SubmitOnce className="px-2.5 py-1 rounded-full bg-emerald/10 text-emerald text-xs font-medium hover:bg-emerald/20">Bill · GST <Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /></SubmitOnce></form>
                      <form action={billEstimateAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="bill_type" value="cash" />{e.sales_employee_id && <input type="hidden" name="sales_employee_id" value={e.sales_employee_id} />}<SubmitOnce className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100">Bill · Final Estimate <Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /></SubmitOnce></form>
                      <form action={denyEstimateAction}><input type="hidden" name="id" value={e.id} /><SubmitOnce className="px-2.5 py-1 rounded-full bg-rose/10 text-rose text-xs hover:bg-rose/20">Deny</SubmitOnce></form>
                    </>}
                    {(e.status === "converted" || e.status === "cash_billed") && e.order_id &&
                      <Link href={`/admin/invoice/${e.order_id}`} className="px-2.5 py-1 rounded-full bg-emerald/10 text-emerald text-xs font-medium hover:bg-emerald/20">{e.status === "cash_billed" ? "View final estimate →" : "View invoice →"}</Link>}
                    {(e.status === "denied" || e.status === "expired") &&
                      <form action={reopenEstimateAction}><input type="hidden" name="id" value={e.id} /><button className="px-2.5 py-1 rounded-full bg-gold/15 text-gold-dark text-xs hover:bg-gold/25">Re-open</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dealer rate requests — merged from the trade portal so quotes + estimates are one hub. */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-display text-2xl text-ink">Dealer rate requests</h2>
          {quoteRows.length > 0 && <span className="text-[11px] rounded-full bg-gold/15 text-gold-dark px-2 py-0.5">{quoteRows.length} active</span>}
          <Link href="/admin/quotes" className="ml-auto text-sm text-emerald nav-link">Full archive <Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /></Link>
        </div>
        <p className="text-sm text-muted mb-4">Wholesale buyers asking for rates from the trade portal. Reply on WhatsApp, note what you quoted, then mark it.</p>
        <div className="space-y-3">
          {quoteRows.length === 0 && <div className="bg-white rounded-2xl p-6 shadow-card text-center text-muted">No open rate requests.</div>}
          {quoteRows.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-ink font-medium">{r.name} <span className="text-muted font-normal">· {r.phone}</span></p>
                  <p className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${r.status === "new" ? "bg-gold/15 text-gold-dark" : "bg-emerald-mist text-emerald-dark"}`}>{r.status}</span>
              </div>
              <pre className="mt-2 text-sm text-ink whitespace-pre-wrap font-sans bg-cream/50 rounded-xl p-3">{r.items}</pre>
              {r.note && <p className="text-xs text-muted mt-1">Note: {r.note}</p>}
              {r.quote_note && <p className="text-xs text-emerald-dark mt-1">Quoted: {r.quote_note}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-sand/60">
                {waLink(r.phone, `Namaste ${r.name}! About your rate enquiry at Aggarwal Jewellers:\n${r.items}\n\nOur rates: `) && (
                  <a href={waLink(r.phone, `Namaste ${r.name}! About your rate enquiry at Aggarwal Jewellers:\n${r.items}\n\nOur rates: `)} target="_blank" className="px-4 py-1.5 rounded-full bg-emerald text-white text-xs font-medium">Reply on WhatsApp <Icon g="↗" className="inline-block align-middle w-[1em] h-[1em]" /></a>
                )}
                <form action={setQuoteStatusAction} className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="quote_note" placeholder="What you quoted (for your record)" defaultValue={r.quote_note ?? ""} className={`${qfld} flex-1 text-xs`} />
                  <select name="status" defaultValue={r.status} className={`${qfld} text-xs`}>
                    <option value="new">New</option><option value="quoted">Quoted</option><option value="closed">Closed</option>
                  </select>
                  <SubmitOnce className="px-3 py-2 rounded-xl bg-ink text-white text-xs">Save</SubmitOnce>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
