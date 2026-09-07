"use client";
import { Icon } from "@/components/ui/Icon";
import { useState } from "react";
import Link from "next/link";

export type StockWatchItem = { sku: string; name: string; qty: number };

export function StockWatchTile({
  title, count, sub, items, href, accent, bar, restock,
}: {
  title: string;
  count: number;
  sub: string;
  items: StockWatchItem[];
  href: string;
  accent?: string;
  bar?: string;
  restock?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative bg-white rounded-2xl shadow-card overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar ?? "bg-emerald"}`} />
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left p-4 hover:bg-cream/40 transition-colors">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted">{title}</p>
          <span className={`text-muted text-sm transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
        </div>
        <p className={`text-[26px] leading-tight font-semibold mt-0.5 ${accent ?? "text-ink"}`}>{count}</p>
        <p className="text-[13px] text-muted mt-0.5">{sub} · tap for list</p>
      </button>
      {open && (
        <div className="border-t border-sand px-4 py-2 max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted py-2">None right now.</p>
          ) : (
            <ul className="text-sm divide-y divide-sand/60">
              {items.map((p) => (
                <li key={p.sku} className="py-1.5 flex items-center justify-between gap-2">
                  <Link href={`/admin/catalogue/${encodeURIComponent(p.sku)}`} className="min-w-0 truncate text-ink hover:text-emerald">
                    {p.name} <span className="text-muted font-mono text-[11px]">· {p.sku}</span>
                  </Link>
                  <span className="shrink-0 flex items-center gap-2">
                    <span className={`tabular-nums ${p.qty <= 2 ? "text-rose font-medium" : "text-muted"}`}>{p.qty} pcs</span>
                    {restock && (
                      <Link href={`/admin/inventory?cls=low&q=${encodeURIComponent(p.sku)}`} className="text-[11px] px-2 py-0.5 rounded-full bg-gold/15 text-gold-dark hover:bg-gold/25">Restock</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href={href} className="block mt-2 mb-1 text-sm text-emerald nav-link">Open full list <Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /></Link>
        </div>
      )}
    </div>
  );
}
