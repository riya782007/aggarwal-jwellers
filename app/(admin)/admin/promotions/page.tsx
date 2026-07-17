export const dynamic = "force-dynamic";
// Poster generation (Gemini/OpenAI) can take 15–40s — raise the function timeout so it never dies at 10s.
export const maxDuration = 60;
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCategories, getPromotionsAdmin, getCustomersDb, getCustomerSpend } from "@/lib/supabase/queries";
import { requirePerm } from "@/lib/auth";
import { openaiConfigured } from "@/lib/ai/providers";
import { geminiConfigured } from "@/lib/ai/gemini";
import { formatPaise } from "@/lib/pricing";
import { PromotionsClient } from "@/components/admin/PromotionsClient";
import { setPromotionSettingsAction } from "@/app/actions/promotions";

export const metadata = { title: "Owner Console · Promotions" };

const CLOSE = 0.7; // "close to target" = has spent at least 70% of the target
function rangeFor(period: string): { from?: string; label: string } {
  const now = new Date();
  if (period === "all") return { label: "all time" };
  if (period === "30d") return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), label: "last 30 days" };
  if (period === "quarter") return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString(), label: "last 3 months" };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), label: "this month" };
}
const waLink = (phone: string, msg: string) => {
  const d = (phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}?text=${encodeURIComponent(msg)}` : "";
};

export default async function PromotionsPage({ searchParams }: { searchParams: { period?: string; target?: string; band?: string } }) {
  if (!(await requirePerm("marketing.manage"))) redirect("/admin/dashboard?denied=promotions");

  // Customer-rewards targeting controls (moved here from the Customers directory).
  const period = searchParams.period ?? "month";
  const band = searchParams.band ?? "all"; // all | reached | close
  const targetRupees = Math.max(0, parseInt(searchParams.target ?? "50000", 10) || 0);
  const targetPaise = targetRupees * 100;
  const range = rangeFor(period);

  const [cats, promos, custRaw, spendMap] = await Promise.all([
    getCategories(),
    getPromotionsAdmin(),
    getCustomersDb({}),
    getCustomerSpend({ from: range.from }),
  ]);
  const categories = ((cats as any[]) ?? []).map((c) => ({ name: c.name, slug: c.slug }));

  let custList = ((custRaw as any[]) ?? []).map((c) => ({ ...c, spend: spendMap.get(c.id)?.spend ?? 0 }));
  const reachedCount = custList.filter((c) => targetPaise > 0 && c.spend >= targetPaise).length;
  const closeCount = custList.filter((c) => targetPaise > 0 && c.spend >= targetPaise * CLOSE && c.spend < targetPaise).length;
  if (band !== "all" && targetPaise > 0) {
    custList = custList.filter((c) => band === "reached" ? c.spend >= targetPaise : c.spend >= targetPaise * CLOSE && c.spend < targetPaise);
  }
  custList.sort((a, b) => b.spend - a.spend);
  custList = custList.slice(0, 100); // keep the reward list focused

  const sel = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";
  const bandTab = (key: string) =>
    `px-3 py-1.5 rounded-full text-sm ${band === key ? "bg-ink text-white" : "bg-white border border-sand text-muted hover:border-emerald"}`;
  const qp = (b: string) => `/admin/promotions?${new URLSearchParams({ period, target: String(targetRupees), band: b })}#customer-rewards`;

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Promotions</h1>
      <p className="text-sm text-muted mb-5">Your marketing home — run storefront offers, and reward or nudge customers who hit a spend target. (Staff incentives coming here too.)</p>

      {/* ---- Storefront offers (AI posters + campaign placement) ---- */}
      <section>
        <h2 className="font-display text-2xl text-ink mb-1">Storefront offers</h2>
        <p className="text-sm text-muted mb-4">Type a rough idea → ChatGPT refines it → Gemini designs the poster → choose where it goes live (hero banner, announcement strip, or popup).</p>
        <PromotionsClient categories={categories} promos={promos as any} ready={{ openai: openaiConfigured(), gemini: geminiConfigured() }} />

        {/* 0049 — Campaign settings: placement + schedule window + optional voucher hook. */}
        <div className="mt-8">
          <h3 className="font-medium text-ink mb-1">Campaign settings</h3>
          <p className="text-sm text-muted mb-4">A <b>strip</b> runs as the announcement bar on top of the store (with countdown), a <b>popup</b> greets visitors once per session, and <b>hero</b> is the big banner. Add a voucher code to show it on the strip/popup.</p>
          <div className="space-y-3">
            {(promos as any[]).filter((p) => p.status !== "archived").map((p) => (
              <form key={p.id} action={setPromotionSettingsAction} className="bg-white rounded-2xl p-4 shadow-card flex flex-wrap items-center gap-3 text-sm">
                <input type="hidden" name="id" value={p.id} />
                {p.image_path && <img src={p.image_path} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                <span className="font-medium text-ink min-w-[120px] max-w-[200px] truncate">{p.title || "Untitled"}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === "published" ? "bg-emerald-mist text-emerald-dark" : "bg-ink/5 text-muted"}`}>{p.status}</span>
                <select name="placement" defaultValue={p.placement ?? "hero"} className="rounded-lg border border-sand px-2 py-1.5">
                  <option value="hero">Hero banner</option><option value="strip">Announcement strip</option><option value="popup">Popup</option>
                </select>
                <input name="headline" defaultValue={p.headline ?? ""} placeholder="Strip/popup headline" className="rounded-lg border border-sand px-2 py-1.5 flex-1 min-w-[160px]" />
                <input name="coupon_code" defaultValue={p.coupon_code ?? ""} placeholder="Voucher code" className="rounded-lg border border-sand px-2 py-1.5 w-28 font-mono uppercase" />
                <input name="starts_at" type="date" defaultValue={p.starts_at ? String(p.starts_at).slice(0, 10) : ""} className="rounded-lg border border-sand px-2 py-1.5" title="Starts" />
                <input name="ends_at" type="date" defaultValue={p.ends_at ? String(p.ends_at).slice(0, 10) : ""} className="rounded-lg border border-sand px-2 py-1.5" title="Ends (drives the countdown)" />
                <button className="px-4 py-1.5 rounded-full bg-ink text-white text-xs">Save</button>
              </form>
            ))}
            {(promos as any[]).filter((p) => p.status !== "archived").length === 0 && (
              <p className="text-sm text-muted">No campaigns yet — generate a poster above to get started.</p>
            )}
          </div>
        </div>
      </section>

      {/* ---- Customer rewards & targeting (moved from the Customers directory) ---- */}
      <section id="customer-rewards" className="mt-12 scroll-mt-6">
        <h2 className="font-display text-2xl text-ink mb-1">🎯 Customer rewards &amp; targeting</h2>
        <p className="text-sm text-muted mb-4">Find customers who reached a spend target — or are close — this period, so you can reward or nudge them on WhatsApp.</p>

        <form action="/admin/promotions" className="bg-white rounded-2xl p-4 shadow-card mb-4 border border-gold/40 flex flex-wrap items-end gap-3">
          <input type="hidden" name="band" value={band} />
          <label className="text-xs text-muted">Spend target ₹
            <input name="target" type="number" min={0} step={1000} defaultValue={targetRupees} className={`${sel} block mt-0.5 w-36`} />
          </label>
          <label className="text-xs text-muted">Period
            <select name="period" defaultValue={period} className={`${sel} block mt-0.5`}>
              <option value="month">This month</option>
              <option value="30d">Last 30 days</option>
              <option value="quarter">Last 3 months</option>
              <option value="all">All time</option>
            </select>
          </label>
          <button className="h-11 px-5 rounded-xl bg-ink text-white text-sm">Apply</button>
          <span className="ml-auto text-xs text-muted self-center">Target {formatPaise(targetPaise)} · {range.label}</span>
        </form>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] uppercase tracking-wide text-muted mr-1">Show</span>
          <Link href={qp("all")} className={bandTab("all")}>All customers</Link>
          <Link href={qp("reached")} className={bandTab("reached")}>✓ Reached target ({reachedCount})</Link>
          <Link href={qp("close")} className={bandTab("close")}>◗ Close ≥{Math.round(CLOSE * 100)}% ({closeCount})</Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
          <table className="w-full text-[15px]">
            <thead className="bg-cream text-muted text-left"><tr>
              <th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3 text-right">Spent ({range.label})</th><th className="p-3">Progress</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {custList.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">No customers match. Try a lower target or a wider period.</td></tr>}
              {custList.map((c: any) => {
                const pct = targetPaise > 0 ? Math.min(100, Math.round((c.spend / targetPaise) * 100)) : 0;
                const reached = targetPaise > 0 && c.spend >= targetPaise;
                const remaining = Math.max(0, targetPaise - c.spend);
                const wa = waLink(c.phone, reached
                  ? `Hi ${c.name}, thank you for shopping with Aggarwal Jewellers! You've reached our offer target — your reward is ready. 🎁`
                  : `Hi ${c.name}, you're almost at our Aggarwal Jewellers offer! Spend ${formatPaise(remaining)} more this period to unlock it. ✨`);
                return (
                  <tr key={c.id} className="border-t border-sand/60 hover:bg-cream/40">
                    <td className="p-3"><Link href={`/admin/customer/${c.id}`} className="text-emerald nav-link font-medium">{c.name}</Link>{c.city ? <span className="block text-[11px] text-muted">{c.city}</span> : null}</td>
                    <td className="p-3 text-muted">{c.phone || "—"}</td>
                    <td className="p-3 text-right tabular-nums">{c.spend ? <span className="font-medium text-ink">{formatPaise(c.spend)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="p-3">
                      {targetPaise > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 rounded-full bg-sand/70 overflow-hidden"><div className={`h-full ${reached ? "bg-emerald" : "bg-gold"}`} style={{ width: `${pct}%` }} /></div>
                          <span className={`text-[11px] tabular-nums ${reached ? "text-emerald-dark" : "text-muted"}`}>{reached ? "✓" : `${pct}%`}</span>
                        </div>
                      ) : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="p-3 text-right">{wa && <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald hover:underline whitespace-nowrap">Reach out ↗</a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
