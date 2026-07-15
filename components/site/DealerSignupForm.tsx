"use client";
import { useState } from "react";
import { applyDealerAction } from "@/app/actions/dealer";

/** Dealer self-signup with mandatory business proof. Applications land as PENDING wholesale
 *  customers — the owner verifies and approves from the Customers page (existing flow). */
export function DealerSignupForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fld = "w-full rounded-xl border border-emerald/30 px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setResult(null);
    try {
      const res = await applyDealerAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.ok) (e.target as HTMLFormElement).reset();
    } catch {
      setResult({ ok: false, message: "Something went wrong — please try again or WhatsApp us." });
    } finally { setBusy(false); }
  }

  if (result?.ok) {
    return <div className="bg-white rounded-xl p-4 text-sm text-emerald-dark">✅ {result.message}</div>;
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" placeholder="Shop / business name" required className={fld} />
        <input name="phone" placeholder="WhatsApp number" inputMode="tel" required className={fld} />
        <input name="city" placeholder="City" className={fld} />
        <input name="gstin" placeholder="GSTIN (optional)" className={fld} />
      </div>
      <div>
        <label className="text-xs text-emerald-dark/80 block mb-1">Business proof (required) — shop photo, GST certificate, Instagram page or website screenshot. Used only for verification.</label>
        <input name="proof" type="file" accept="image/*,application/pdf" required className={`${fld} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald file:text-white file:px-3 file:py-1 file:text-xs`} />
      </div>
      <textarea name="note" rows={2} placeholder="Anything else? (what you sell, how you found us…)" className={fld} />
      {result && !result.ok && <p className="text-sm text-rose">{result.message}</p>}
      <button disabled={busy} className="btn-gold w-full py-3 text-sm font-medium disabled:opacity-60">{busy ? "Submitting…" : "Apply for a dealer account"}</button>
    </form>
  );
}
