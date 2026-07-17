export const dynamic = "force-dynamic";
// Poster generation (Gemini/OpenAI) can take 15–40s — raise the function timeout so it never dies at 10s.
export const maxDuration = 60;
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCategories, getPromotionsAdmin, getCustomersDb, getCustomerSpend, getRewardCampaigns } from "@/lib/supabase/queries";
import { requirePerm } from "@/lib/auth";
import { openaiConfigured } from "@/lib/ai/providers";
import { geminiConfigured } from "@/lib/ai/gemini";
import { formatPaise } from "@/lib/pricing";
import { PromotionsClient } from "@/components/admin/PromotionsClient";
import { setPromotionSettingsAction, createRewardCampaignAction, endRewardCampaignAction, deleteRewardCampaignAction } from "@/app/actions/promotions";

export const metadata = { title: "Owner Console · Promotions" };

const CLOSE = 0.7; // "close to target" = ≥70% of the campaign target
const waLink = (phone: string, msg: string) => {
  const d = (phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}?text=${encodeURIComponent(msg)}` : "";
};
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function PromotionsPage() {
  if (!(await requirePerm("marketing.manage"))) redirect("/admin/dashboard?denied=promotions");

  const now = Date.now();
  const [cats, promos, campaigns, custRaw] = await Promise.all([
    getCategories(), getPromotionsAdmin(), getRewardCampaigns(), getCustomersDb({}),
  ]);
  const categories = ((cats as any[]) ?? []).map((c) => ({ name: c.name, slug: c.slug }));
  const customers = (custRaw as any[]) ?? [];

  const phase = (c: any): "active" | "upcoming" | "ended" => {
    const s = new Date(c.starts_at).getTime();
    const e = c.ends_at ? new Date(c.ends_at).getTime() : null;
    if (c.status === "ended" || (e != null && e < now)) return "ended";
    if (s > now) return "upcoming";
    return "active";
  };
  const active = campaigns.filter((c) => phase(c) === "active");
  const upcoming = campaigns.filter((c) => phase(c) === "upcoming");
  const ended = campaigns.filter((c) => phase(c) === "ended");

  // Spend per active campaign, measured ONLY within its window (start → min(now, end)).
  const spendByCampaign = new Map<string, Map<string, { spend: number; orders: number; last: string | null }>>();
  await Promise.all(active.map(async (c) => {
    const to = c.ends_at && new Date(c.ends_at).getTime() < now ? c.ends_at : new Date().toISOString();
    spendByCampaign.set(c.id, await getCustomerSpend({ from: c.starts_at, to }));
  }));

  const inp = "h-11 rounded-xl border border-sand bg-white px-3 text-[15px] outline-none focus:border-emerald";

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Promotions</h1>
      <p className="text-sm text-muted mb-5">Your marketing home — run storefront offers, and reward customers who hit a spend target during a campaign. (Staff incentives coming here too.)</p>

      {/* ---- Storefront offers ---- */}
      <section>
        <h2 className="font-display text-2xl text-ink mb-1">Storefront offers</h2>
        <p className="text-sm text-muted mb-4">Type a rough idea → ChatGPT refines it → Gemini designs the poster → choose where it goes live (hero banner, announcement strip, or popup).</p>
        <PromotionsClient categories={categories} promos={promos as any} ready={{ openai: openaiConfigured(), gemini: geminiConfigured() }} />

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

      {/* ---- Customer rewards & targeting (campaign-driven) ---- */}
      <section id="customer-rewards" className="mt-12 scroll-mt-6">
        <h2 className="font-display text-2xl text-ink mb-1">🎯 Customer rewards &amp; targeting</h2>
        <p className="text-sm text-muted mb-4">Run a reward campaign with a spend target and dates. Progress is tracked <b>only within the campaign window</b> — nothing is measured before it starts or after it ends.</p>

        {/* Create a reward campaign */}
        <form action={createRewardCampaignAction} className="bg-white rounded-2xl p-5 shadow-card mb-5 border border-gold/40">
          <h3 className="font-medium text-ink mb-3">Start a reward campaign</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-xs text-muted">Campaign name<input name="name" required placeholder="e.g. Diwali Spenders" className={`${inp} block w-full mt-0.5`} /></label>
            <label className="text-xs text-muted">Spend target ₹<input name="target" type="number" min={1} step={1000} required placeholder="50000" className={`${inp} block w-full mt-0.5`} /></label>
            <label className="text-xs text-muted">Who counts<select name="scope" defaultValue="all" className={`${inp} block w-full mt-0.5`}><option value="all">All customers</option><option value="retail">Retail only</option><option value="wholesale">Wholesale only</option></select></label>
            <label className="text-xs text-muted">Starts<input name="starts_at" type="date" className={`${inp} block w-full mt-0.5`} /></label>
            <label className="text-xs text-muted">Ends (optional)<input name="ends_at" type="date" className={`${inp} block w-full mt-0.5`} /></label>
            <label className="text-xs text-muted">Reward (what they get)<input name="reward_note" placeholder="e.g. ₹500 off next order" className={`${inp} block w-full mt-0.5`} /></label>
          </div>
          <button className="btn-primary px-5 py-2.5 text-sm font-medium mt-3">Start campaign</button>
        </form>

        {campaigns.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-card text-center text-muted">No reward campaigns yet. Start one above to begin tracking spend toward a target.</div>
        )}

        {/* Active campaigns — each with its own progress table */}
        {active.map((c) => {
          const spendMap = spendByCampaign.get(c.id) ?? new Map();
          const scoped = customers.filter((cu) => c.scope === "all" || cu.type === c.scope);
          const list = scoped.map((cu) => ({ ...cu, spend: spendMap.get(cu.id)?.spend ?? 0 })).sort((a, b) => b.spend - a.spend);
          const reached = list.filter((cu) => cu.spend >= c.target_paise).length;
          const close = list.filter((cu) => cu.spend >= c.target_paise * CLOSE && cu.spend < c.target_paise).length;
          return (
            <div key={c.id} className="bg-white rounded-2xl shadow-card mb-5 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 p-4 border-b border-sand bg-cream/50">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-mist text-emerald-dark font-medium">● LIVE</span>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.name} <span className="font-normal text-muted">· target {formatPaise(c.target_paise)}</span></p>
                  <p className="text-[11px] text-muted">{fmtDate(c.starts_at)} → {c.ends_at ? fmtDate(c.ends_at) : "open-ended"} · {c.scope === "all" ? "all customers" : `${c.scope} only`}{c.reward_note ? ` · 🎁 ${c.reward_note}` : ""}</p>
                </div>
                <span className="ml-auto text-xs text-emerald-dark font-medium">{reached} reached · {close} close</span>
                <form action={endRewardCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="text-xs px-3 py-1.5 rounded-lg bg-ink/5 text-ink hover:bg-ink/10">End now</button></form>
                <form action={deleteRewardCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="text-xs px-3 py-1.5 rounded-lg bg-rose/10 text-rose hover:bg-rose/20">Delete</button></form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[15px]">
                  <thead className="bg-cream text-muted text-left"><tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3 text-right">Spent (in campaign)</th><th className="p-3">Progress</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">No customers in scope yet.</td></tr>}
                    {list.map((cu: any) => {
                      const pct = Math.min(100, Math.round((cu.spend / c.target_paise) * 100));
                      const isReached = cu.spend >= c.target_paise;
                      const remaining = Math.max(0, c.target_paise - cu.spend);
                      const wa = waLink(cu.phone, isReached
                        ? `Hi ${cu.name}, thank you for shopping with Aggarwal Jewellers! You've reached our ${c.name} target${c.reward_note ? ` — your reward: ${c.reward_note}` : ""}. 🎁`
                        : `Hi ${cu.name}, you're almost there in our ${c.name} offer! Spend ${formatPaise(remaining)} more to unlock${c.reward_note ? ` ${c.reward_note}` : " your reward"}. ✨`);
                      return (
                        <tr key={cu.id} className="border-t border-sand/60 hover:bg-cream/40">
                          <td className="p-3"><Link href={`/admin/customer/${cu.id}`} className="text-emerald nav-link font-medium">{cu.name}</Link>{cu.city ? <span className="block text-[11px] text-muted">{cu.city}</span> : null}</td>
                          <td className="p-3 text-muted">{cu.phone || "—"}</td>
                          <td className="p-3 text-right tabular-nums">{cu.spend ? <span className="font-medium text-ink">{formatPaise(cu.spend)}</span> : <span className="text-muted">—</span>}</td>
                          <td className="p-3"><div className="flex items-center gap-2"><div className="h-1.5 w-28 rounded-full bg-sand/70 overflow-hidden"><div className={`h-full ${isReached ? "bg-emerald" : "bg-gold"}`} style={{ width: `${pct}%` }} /></div><span className={`text-[11px] tabular-nums ${isReached ? "text-emerald-dark" : "text-muted"}`}>{isReached ? "✓" : `${pct}%`}</span></div></td>
                          <td className="p-3 text-right">{wa && <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald hover:underline whitespace-nowrap">Reach out ↗</a>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* Upcoming / ended — compact rows */}
        {(upcoming.length > 0 || ended.length > 0) && (
          <div className="space-y-2">
            {upcoming.map((c) => (
              <div key={c.id} className="bg-white rounded-xl p-3 shadow-card flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gold/15 text-gold-dark">Upcoming</span>
                <span className="font-medium text-ink">{c.name}</span>
                <span className="text-muted text-xs">target {formatPaise(c.target_paise)} · starts {fmtDate(c.starts_at)}</span>
                <form action={deleteRewardCampaignAction} className="ml-auto"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-rose hover:underline">Delete</button></form>
              </div>
            ))}
            {ended.map((c) => (
              <div key={c.id} className="bg-white/60 rounded-xl p-3 shadow-card flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink/5 text-muted">Ended</span>
                <span className="font-medium text-ink/80">{c.name}</span>
                <span className="text-muted text-xs">target {formatPaise(c.target_paise)} · {fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}</span>
                <form action={deleteRewardCampaignAction} className="ml-auto"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-rose hover:underline">Delete</button></form>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
