export const dynamic = "force-dynamic";
import { supabaseServer } from "@/lib/supabase/server";
import { setQuoteStatusAction } from "@/app/actions/quotes";
import { SubmitOnce } from "@/components/admin/SubmitOnce";

export const metadata = { title: "Owner Console · Quote Requests" };

const waLink = (phone: string, msg: string) => {
  const d = (phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}?text=${encodeURIComponent(msg)}` : "";
};

export default async function Quotes({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = ["new", "quoted", "closed", "all"].includes(searchParams.tab ?? "") ? (searchParams.tab as string) : "new";
  let q = supabaseServer().from("quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (tab !== "all") q = q.eq("status", tab);
  const { data } = await q;
  const rows = (data as any[]) ?? [];
  const fld = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";

  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen max-w-4xl">
      <h1 className="font-display text-4xl text-ink mb-1">Quote Requests</h1>
      <p className="text-sm text-muted mb-4">Dealers asking for rates from the trade portal. Reply on WhatsApp, note what you quoted, and mark it.</p>
      <div className="flex gap-2 mb-4">
        {(["new", "quoted", "closed", "all"] as const).map((t) => (
          <a key={t} href={`/admin/quotes?tab=${t}`} className={`px-4 py-1.5 rounded-full text-sm capitalize ${tab === t ? "bg-ink text-white" : "bg-white text-muted border border-sand hover:text-ink"}`}>{t}</a>
        ))}
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="bg-white rounded-2xl p-8 shadow-card text-center text-muted">No {tab === "all" ? "" : tab + " "}quote requests.</div>}
        {rows.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-ink font-medium">{r.name} <span className="text-muted font-normal">· {r.phone}</span></p>
                <p className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${r.status === "new" ? "bg-gold/15 text-gold-dark" : r.status === "quoted" ? "bg-emerald-mist text-emerald-dark" : "bg-ink/5 text-muted"}`}>{r.status}</span>
            </div>
            <pre className="mt-2 text-sm text-ink whitespace-pre-wrap font-sans bg-cream/50 rounded-xl p-3">{r.items}</pre>
            {r.note && <p className="text-xs text-muted mt-1">Note: {r.note}</p>}
            {r.quote_note && <p className="text-xs text-emerald-dark mt-1">Quoted: {r.quote_note}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-sand/60">
              {waLink(r.phone, `Namaste ${r.name}! About your rate enquiry at Aggarwal Jewellers:\n${r.items}\n\nOur rates: `) && (
                <a href={waLink(r.phone, `Namaste ${r.name}! About your rate enquiry at Aggarwal Jewellers:\n${r.items}\n\nOur rates: `)} target="_blank" className="px-4 py-1.5 rounded-full bg-emerald text-white text-xs font-medium">Reply on WhatsApp ↗</a>
              )}
              <form action={setQuoteStatusAction} className="flex items-center gap-2 flex-1 min-w-[240px]">
                <input type="hidden" name="id" value={r.id} />
                <input name="quote_note" placeholder="What you quoted (for your record)" defaultValue={r.quote_note ?? ""} className={`${fld} flex-1 text-xs`} />
                <select name="status" defaultValue={r.status} className={`${fld} text-xs`}>
                  <option value="new">New</option><option value="quoted">Quoted</option><option value="closed">Closed</option>
                </select>
                <SubmitOnce className="px-3 py-2 rounded-xl bg-ink text-white text-xs">Save</SubmitOnce>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
