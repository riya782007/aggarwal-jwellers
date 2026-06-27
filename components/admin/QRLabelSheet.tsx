"use client";
import { useState, useMemo } from "react";
import { formatPaise } from "@/lib/pricing";
import { QRCode } from "@/components/admin/QRCode";
import { QtyField } from "@/components/admin/QtyField";

type P = { sku: string; name: string; price: number };

/**
 * QR label sheet — the QR replacement for barcode tags (§7).
 * Each label: a scannable QR (SKU or product link) plus the name, SKU and price,
 * laid out for a 50×25mm sticker (3 per row on A4). Toggles let the owner choose
 * what the QR encodes and whether the price is printed.
 */
export function QRLabelSheet({ products, siteUrl }: { products: P[]; siteUrl: string }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ sku: string; name: string; price: number; count: number }[]>([]);
  const [payload, setPayload] = useState<"sku" | "link">("sku");
  const [showPrice, setShowPrice] = useState(true);
  const matches = useMemo(
    () => (q.trim() ? products.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []),
    [q, products],
  );

  const add = (p: P) => { setItems((prev) => (prev.find((x) => x.sku === p.sku) ? prev : [...prev, { ...p, count: 1 }])); setQ(""); };
  const setCount = (sku: string, n: number) => setItems((prev) => prev.map((x) => (x.sku === sku ? { ...x, count: Math.max(1, Math.floor(n || 1)) } : x)));
  const rm = (sku: string) => setItems((prev) => prev.filter((x) => x.sku !== sku));
  const labels = items.flatMap((it) => Array.from({ length: it.count }, () => it));
  const base = (siteUrl || "").replace(/\/$/, "");
  const qrValue = (sku: string) => (payload === "link" && base ? `${base}/catalog?q=${encodeURIComponent(sku)}` : sku);
  const input = "w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald";
  const perSheet = 33;

  return (
    <div>
      <div className="bg-white rounded-2xl p-5 shadow-card mb-5 no-print">
        <h2 className="font-medium text-ink mb-3">Add SKUs to print</h2>
        <div className="relative mb-3">
          <input className={input} placeholder="Search product by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
              {matches.map((p) => (
                <button key={p.sku} onClick={() => add(p)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-mist flex justify-between">
                  <span>{p.name} <span className="text-muted">· {p.sku}</span></span><span>{formatPaise(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
          <span className="text-muted">QR encodes:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="payload" checked={payload === "sku"} onChange={() => setPayload("sku")} /> SKU only
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="payload" checked={payload === "link"} onChange={() => setPayload("link")} /> Product link
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer ml-2">
            <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Print price
          </label>
        </div>

        {items.length === 0 && <p className="text-sm text-muted">No SKUs selected yet.</p>}
        {items.map((it) => (
          <div key={it.sku} className="flex items-center gap-3 border-b border-sand/60 py-2 text-sm">
            <span className="flex-1">{it.name} <span className="text-muted">· {it.sku}</span></span>
            <label className="text-xs text-muted flex items-center gap-1"># labels
              <QtyField value={it.count} onChange={(n) => setCount(it.sku, n)} className="w-16 rounded-lg border border-sand px-2 py-1 text-center" />
            </label>
            <button onClick={() => rm(it.sku)} className="text-muted hover:text-rose">✕</button>
          </div>
        ))}
        {labels.length > 0 && (
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => window.print()} className="btn-primary px-6 py-2.5 text-sm font-medium">🖶 Print {labels.length} label{labels.length === 1 ? "" : "s"}</button>
            <span className="text-xs text-muted">{labels.length} labels · ~{Math.ceil(labels.length / perSheet)} A4 sheet{Math.ceil(labels.length / perSheet) === 1 ? "" : "s"} (50×25mm, {perSheet} per sheet)</span>
          </div>
        )}
      </div>

      {labels.length > 0 && (
        <div className="print-area">
          <div className="qr-grid grid grid-cols-2 sm:grid-cols-3 gap-2">
            {labels.map((it, i) => (
              <div key={i} className="qr-label border border-sand bg-white break-inside-avoid flex items-center gap-2 p-2">
                <QRCode value={qrValue(it.sku)} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="ql-name font-semibold text-ink leading-tight truncate">{it.name}</p>
                  <p className="ql-sku tracking-wider text-ink">{it.sku}</p>
                  {showPrice && <p className="ql-price font-medium text-ink">{formatPaise(it.price)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
