"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPurchaseFromPasteAction } from "@/app/actions/purchases";

/** 0049 — paste a whole supplier bill: one line per item ("SKU  qty  price"). SKUs auto-map
 *  to products/variants; unmapped lines are still recorded so the paper bill stays complete. */
export function BulkPurchasePaste({ suppliers }: { suppliers: { id: string; name: string; city?: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const fld = "rounded-xl border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-emerald";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await recordPurchaseFromPasteAction(new FormData(e.currentTarget));
      if (res.ok) {
        setMsg({ ok: true, text: `Bill recorded — ${res.mapped} line(s) mapped to stock${res.unmapped ? `, ${res.unmapped} unmapped (map them on the purchase page)` : ""}.`, link: res.purchaseId ? `/admin/purchase/${res.purchaseId}` : undefined });
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else setMsg({ ok: false, text: res.error ?? "Couldn't record the bill." });
    } catch { setMsg({ ok: false, text: "Something went wrong — try again." }); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-card mb-6 border border-gold/30">
      <h2 className="font-medium text-ink mb-1">⚡ Paste the whole bill</h2>
      <p className="text-xs text-muted mb-3">One line per item — <code className="bg-cream px-1 rounded">SKU&nbsp;&nbsp;qty&nbsp;&nbsp;price</code> (tabs, commas or spaces; straight from Excel works). Variant SKUs (e.g. AJ1004-RED) add stock to that colour.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <select name="supplier_id" required defaultValue="" className={fld}>
            <option value="" disabled>Choose supplier…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>)}
          </select>
          <input name="bill_no" placeholder="Bill number" className={fld} />
        </div>
        <textarea name="lines" rows={6} required placeholder={"AJ1004\t12\t450\nAJ1007-RED\t6\t320\nKN2210, 24, 275"} className={`${fld} w-full font-mono text-xs`} />
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-dark" : "text-rose"}`}>{msg.text} {msg.link && <a href={msg.link} className="text-emerald nav-link">Open bill →</a>}</p>}
        <button disabled={busy} className="btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-60">{busy ? "Recording…" : "Record purchase"}</button>
      </form>
    </div>
  );
}
