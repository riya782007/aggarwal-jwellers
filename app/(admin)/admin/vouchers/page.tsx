export const dynamic = "force-dynamic";
import { supabaseServer } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/pricing";
import { createVoucherAction, toggleVoucherAction, deleteVoucherAction } from "@/app/actions/vouchers";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { SubmitOnce } from "@/components/admin/SubmitOnce";

export const metadata = { title: "Owner Console · Vouchers" };

export default async function Vouchers() {
  const { data } = await supabaseServer().from("vouchers").select("*").order("created_at", { ascending: false });
  const rows = (data as any[]) ?? [];
  const fld = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";

  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen max-w-5xl">
      <h1 className="font-display text-4xl text-ink mb-1">Vouchers</h1>
      <p className="text-sm text-muted mb-5">Discount codes for the storefront & trade portal. The discount is always re-checked on the server at order time and lands on the bill itself — GST, Udhaar and the day-book all see the discounted figure.</p>

      <div className="bg-white rounded-2xl p-5 shadow-card mb-6">
        <h2 className="font-medium text-ink mb-3">Create a voucher</h2>
        <form action={createVoucherAction} className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <input name="code" placeholder="CODE (e.g. DIWALI10)" required className={`${fld} font-mono uppercase`} />
          <select name="kind" className={fld} defaultValue="percent"><option value="percent">% off</option><option value="flat">Flat ₹ off</option></select>
          <input name="value" type="number" min="1" placeholder="Value (% or ₹)" required className={fld} />
          <input name="cap" type="number" min="0" placeholder="Max discount ₹ (for %)" className={fld} />
          <input name="min_order" type="number" min="0" placeholder="Min order ₹" className={fld} />
          <select name="channel" className={fld} defaultValue="retail"><option value="retail">Retail store</option><option value="wholesale">Trade portal</option><option value="all">Both</option></select>
          <input name="usage_limit" type="number" min="0" placeholder="Usage limit (blank = ∞)" className={fld} />
          <div className="flex gap-2 items-center">
            <input name="starts_at" type="date" className={fld} title="Starts" />
            <input name="ends_at" type="date" className={fld} title="Ends" />
          </div>
          <SubmitOnce className="btn-primary px-5 py-2 text-sm font-medium sm:col-span-3 lg:col-span-4 justify-self-start">+ Create voucher</SubmitOnce>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted text-left"><tr>
            <th className="p-3">Code</th><th className="p-3">Discount</th><th className="p-3">Rules</th><th className="p-3">Window</th><th className="p-3 text-right">Used</th><th className="p-3">Status</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-muted">No vouchers yet — create your first code above.</td></tr>}
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-sand/60">
                <td className="p-3 font-mono font-medium text-ink">{v.code}</td>
                <td className="p-3">{v.kind === "flat" ? formatPaise(v.value) : `${v.value}%${v.cap ? ` (max ${formatPaise(v.cap)})` : ""}`}</td>
                <td className="p-3 text-muted text-xs">{v.min_order > 0 ? `min ${formatPaise(v.min_order)} · ` : ""}{v.channel}</td>
                <td className="p-3 text-muted text-xs">{v.starts_at ? new Date(v.starts_at).toLocaleDateString("en-IN") : "now"} → {v.ends_at ? new Date(v.ends_at).toLocaleDateString("en-IN") : "∞"}</td>
                <td className="p-3 text-right">{v.used_count}{v.usage_limit ? ` / ${v.usage_limit}` : ""}</td>
                <td className="p-3">
                  <form action={toggleVoucherAction}>
                    <input type="hidden" name="id" value={v.id} /><input type="hidden" name="active" value={v.active ? "0" : "1"} />
                    <button className={`text-xs px-2.5 py-1 rounded-full ${v.active ? "bg-emerald-mist text-emerald-dark" : "bg-ink/5 text-muted"}`}>{v.active ? "● Live — tap to pause" : "○ Paused — tap to go live"}</button>
                  </form>
                </td>
                <td className="p-3 text-right">
                  <form action={deleteVoucherAction}><input type="hidden" name="id" value={v.id} />
                    <ConfirmSubmit message={`Delete voucher ${v.code}? Past orders keep their discount.`} className="text-xs text-rose hover:underline">Delete</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
