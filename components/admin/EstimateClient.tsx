"use client";
import { useState, useMemo } from "react";
import { formatPaise } from "@/lib/pricing";
import { createEstimateAction } from "@/app/actions/billing";

type P = { sku: string; name: string; price: number };
export function EstimateClient({ products }: { products: P[] }) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ sku: string; name: string; price: number; qty: number }[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const matches = useMemo(() => q.trim() ? products.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [], [q, products]);
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const add = (p: P) => { setLines((prev) => prev.find((l) => l.sku === p.sku) ? prev.map((l) => l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l) : [...prev, { ...p, qty: 1 }]); setQ(""); };
  const input = "w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald";
  async function save() {
    setBusy(true); setMsg("");
    const res = await createEstimateAction({ items: lines.map((l) => ({ sku: l.sku, qty: l.qty })), customer: { name, phone } });
    setBusy(false);
    if (res.ok) { setMsg(`✓ Estimate saved (${formatPaise(res.total ?? 0)}) — find it below to bill or hold.`); setLines([]); setName(""); setPhone(""); }
    else setMsg(`✕ ${res.error}`);
  }
  return (
    <div className="bg-white rounded-2xl p-6 shadow-card mb-6">
      <h2 className="font-medium text-ink mb-3">New estimate / quotation</h2>
      <div className="relative mb-3">
        <input className={input} placeholder="Search product to add…" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
            {matches.map((p) => <button key={p.sku} onClick={() => add(p)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-mist flex justify-between"><span>{p.name} <span className="text-muted">· {p.sku}</span></span><span>{formatPaise(p.price)}</span></button>)}
          </div>
        )}
      </div>
      {lines.map((l) => (
        <div key={l.sku} className="flex items-center gap-3 border-b border-sand/60 py-2 text-sm">
          <span className="flex-1">{l.name}</span>
          <div className="inline-flex items-center rounded-full border border-sand overflow-hidden">
            <button onClick={() => setLines((p) => p.map((x) => x.sku === l.sku ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="px-2.5 py-1 hover:bg-cream">−</button>
            <input type="number" min={1} value={l.qty} onChange={(e) => { const v = Math.max(1, Math.floor(parseInt(e.target.value, 10) || 1)); setLines((p) => p.map((x) => x.sku === l.sku ? { ...x, qty: v } : x)); }} className="w-14 text-center border-x border-sand py-1 outline-none focus:bg-emerald-mist [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <button onClick={() => setLines((p) => p.map((x) => x.sku === l.sku ? { ...x, qty: x.qty + 1 } : x))} className="px-2.5 py-1 hover:bg-cream">+</button>
          </div>
          <span className="w-20 text-right font-medium">{formatPaise(l.price * l.qty)}</span>
          <button onClick={() => setLines((p) => p.filter((x) => x.sku !== l.sku))} className="text-muted hover:text-rose">✕</button>
        </div>
      ))}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
        <input className={input + " flex-1"} placeholder="Customer name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input + " sm:w-44"} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <span className="text-lg font-semibold text-ink whitespace-nowrap">{formatPaise(total)}</span>
        <button onClick={save} disabled={busy || !lines.length} className="btn-primary px-5 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : "Save estimate"}</button>
      </div>
      {msg && <p className="text-sm mt-2 text-ink">{msg}</p>}
    </div>
  );
}
