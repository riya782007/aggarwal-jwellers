"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = {
  kind: "product" | "variant";
  id: string;
  sku: string;
  name: string;
  qty: number;
  status: string;
  category: string;
  categorySlug: string;
  image: string | null;
  variantSku?: string;
  color?: string | null;
  href: string;
};

function stockBadge(qty: number) {
  if (qty <= 0) return { label: "Out of stock", cls: "bg-rose/15 text-rose" };
  if (qty <= 2) return { label: `Low · ${qty}`, cls: "bg-gold/20 text-gold-dark" };
  return { label: `${qty} in stock`, cls: "bg-emerald-mist text-emerald-dark" };
}

/** Admin catalogue search with live dropdown — partial SKU / name / colour code. */
export function CatalogueSearch({
  initialQ = "",
  category = "all",
  status = "all",
}: {
  initialQ?: string;
  category?: string;
  status?: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(initialQ);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    const q = term.trim();
    if (q.length < 1) {
      setHits([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/catalogue-suggest?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!r.ok) {
          setHits([]);
          setBusy(false);
          return;
        }
        const d = await r.json();
        const list: Hit[] = d.hits ?? [];
        setHits(list);
        setOpen(list.length > 0);
        setActive(0);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 160);
    return () => {
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [term]);

  function goSearch(q: string) {
    setOpen(false);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category && category !== "all") params.set("category", category);
    if (status && status !== "all") params.set("status", status);
    const qs = params.toString();
    router.push(`/admin/catalogue${qs ? `?${qs}` : ""}`);
  }

  function goHit(h: Hit) {
    setOpen(false);
    router.push(h.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && hits[active]) {
        e.preventDefault();
        goHit(hits[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative flex-1 min-w-[200px]">
      <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3 py-2 focus-within:border-emerald">
        <span className="text-muted text-sm" aria-hidden>⌕</span>
        <input
          name="q"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search name, SKU or colour code…"
          autoComplete="off"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted min-w-0"
          aria-label="Search catalogue"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {busy && <span className="text-[10px] text-muted shrink-0">…</span>}
        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              setHits([]);
              setOpen(false);
              goSearch("");
            }}
            className="text-muted hover:text-ink text-sm shrink-0"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {open && hits.length > 0 && (
        <ul
          className="absolute z-40 mt-1.5 w-full max-h-96 overflow-y-auto rounded-2xl bg-white border border-sand shadow-luxe py-1 text-left"
          role="listbox"
        >
          {hits.map((h, i) => {
            const st = stockBadge(h.qty);
            const labelSku = h.variantSku || h.sku;
            return (
              <li key={`${h.kind}-${labelSku}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goHit(h)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === active ? "bg-cream" : "hover:bg-cream/70"
                  }`}
                >
                  <div className="h-11 w-9 rounded-lg overflow-hidden bg-cream border border-sand shrink-0">
                    {h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[9px] text-muted">—</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate font-medium">{h.name}</p>
                    <p className="text-[11px] text-muted truncate">
                      <span className="font-mono text-ink/80">{labelSku}</span>
                      {h.color ? ` · ${h.color}` : ""}
                      {h.category ? ` · ${h.category}` : ""}
                      {h.kind === "variant" ? " · colour SKU" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    <p className="text-[10px] text-muted mt-0.5 capitalize">{h.status}</p>
                  </div>
                </button>
              </li>
            );
          })}
          <li className="border-t border-sand/60">
            <button
              type="button"
              onClick={() => goSearch(term)}
              className="w-full px-3 py-2.5 text-left text-sm text-emerald hover:bg-cream/70"
            >
              Show all results for “{term.trim()}” →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
