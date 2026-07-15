"use client";
import { useState } from "react";
import { createQuoteRequestAction } from "@/app/actions/quotes";

export function QuoteRequestForm({ defaultName = "", loggedIn = false }: { defaultName?: string; loggedIn?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fld = "w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setResult(null);
    try {
      const res = await createQuoteRequestAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.ok) (e.target as HTMLFormElement).reset();
    } catch { setResult({ ok: false, message: "Something went wrong — please try again." }); }
    finally { setBusy(false); }
  }

  if (result?.ok) return <div className="bg-emerald-mist rounded-2xl p-5 text-emerald-dark">✅ {result.message}</div>;
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 shadow-card space-y-3">
      {!loggedIn && (
        <div className="grid grid-cols-2 gap-3">
          <input name="name" defaultValue={defaultName} placeholder="Shop / your name" required className={fld} />
          <input name="phone" placeholder="WhatsApp number" inputMode="tel" required className={fld} />
        </div>
      )}
      <textarea name="items" rows={5} required placeholder={"What do you need? One line per item, e.g.\nAJ1004 Kundan choker — 24 pcs\nOxidised jhumka (any) — 50 pcs"} className={fld} />
      <textarea name="note" rows={2} placeholder="Budget / delivery city / anything else (optional)" className={fld} />
      {result && !result.ok && <p className="text-sm text-rose">{result.message}</p>}
      <button disabled={busy} className="btn-primary w-full py-3 text-sm font-medium disabled:opacity-60">{busy ? "Sending…" : "Send quote request →"}</button>
    </form>
  );
}
