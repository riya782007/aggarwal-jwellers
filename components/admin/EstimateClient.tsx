"use client";
import { Icon } from "@/components/ui/Icon";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/pricing";
import { createEstimateAction, resolveSellableSku } from "@/app/actions/billing";
import { resolveBoxScanAction } from "@/app/actions/groups";
import { QtyField } from "@/components/admin/QtyField";
import { SoldByPicker } from "@/components/admin/SoldByPicker";

type P = { sku: string; name: string; price: number; wholesale: number; qty?: number };
type Cust = { id: string; name: string; phone: string; type: string; gstin: string };
type Emp = { id: string; name: string };
type Line = { sku: string; name: string; price: number; wholesale: number; qty: number; stock: number; override: string };

const TIER_LABEL: Record<string, string> = { retail: "R", wholesale: "W" };

export function EstimateClient({ products, customers = [], employees = [] }: { products: P[]; customers?: Cust[]; employees?: Emp[] }) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [addr, setAddr] = useState("");
  const [custType, setCustType] = useState<"retail" | "wholesale">("retail");
  const [salesEmp, setSalesEmp] = useState("");
  const [packing, setPacking] = useState("");
  const [courier, setCourier] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [mergeVariants, setMergeVariants] = useState(false);
  const [custQ, setCustQ] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => (q.trim() ? products.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []), [q, products]);
  const custMatches = useMemo(() => {
    const s = custQ.trim().toLowerCase();
    if (!s) return [];
    return customers.filter((c) => (c.name ?? "").toLowerCase().includes(s) || (c.phone ?? "").includes(s)).slice(0, 6);
  }, [custQ, customers]);

  const baseUnit = (l: Line | P) => (custType === "wholesale" && l.wholesale > 0 ? l.wholesale : l.price);
  const effUnit = (l: Line) => {
    const ov = l.override.trim();
    if (ov !== "" && Number.isFinite(Number(ov)) && Number(ov) >= 0) return Math.round(Number(ov) * 100);
    return baseUnit(l);
  };
  const toPaise = (v: string) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
  const chargesTotal = Math.max(0, toPaise(packing)) + Math.max(0, toPaise(courier)) + toPaise(adjustment);
  const total = lines.reduce((s, l) => s + effUnit(l) * l.qty, 0) + chargesTotal;

  function add(p: P, n = 1) {
    const addN = Math.max(1, Math.floor(n));
    setLines((prev) => {
      const ex = prev.find((l) => l.sku === p.sku);
      if (ex) return prev.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + addN } : l));
      return [...prev, { sku: p.sku, name: p.name, price: p.price, wholesale: p.wholesale, qty: addN, stock: p.qty ?? 0, override: "" }];
    });
    setQ("");
  }

  function skuFromScan(raw: string): string {
    const m = raw.match(/\/p\/([A-Za-z0-9%._-]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    return raw;
  }
  function groupCodeFromScan(raw: string): string | null {
    const s = raw.trim();
    const m = s.match(/\/g\/([A-Za-z0-9%._-]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    if (/^GRP-[A-Za-z0-9]+$/i.test(s)) return s.toUpperCase();
    return null;
  }
  async function submitSearch() {
    const groupCode = groupCodeFromScan(q.trim());
    if (groupCode) {
      setScanMsg({ text: "Box…", ok: true });
      const r = await resolveBoxScanAction(groupCode);
      if (r.ok && r.item && r.packQty) {
        const addN = Math.max(0, Math.min(r.packQty, r.item.qty));
        if (addN <= 0) setScanMsg({ text: `${r.item.name}: out of stock`, ok: false });
        else {
          add(r.item, addN);
          const short = r.item.qty < r.packQty;
          setScanMsg({ text: `Box · ${r.item.name} ×${addN}${short ? ` — only ${r.item.qty} of ${r.packQty} in stock` : ""}`, ok: !short });
        }
      } else setScanMsg({ text: r.error ?? "Box QR not recognised", ok: false });
      setQ(""); searchRef.current?.focus(); return;
    }
    const code = skuFromScan(q.trim());
    if (!code) return;
    const exact = products.find((x) => x.sku.toLowerCase() === code.toLowerCase());
    const p = exact ?? matches[0];
    if (p) { add(p); setScanMsg({ text: `Added ${p.name}${p.qty != null ? ` · ${p.qty} in stock` : ""}`, ok: (p.qty ?? 1) > 0 }); searchRef.current?.focus(); return; }
    setScanMsg({ text: "Looking up…", ok: true });
    const found = await resolveSellableSku(code);
    if (found) { add(found); setScanMsg({ text: `Added ${found.name} · ${found.qty} in stock`, ok: found.qty > 0 }); }
    else setScanMsg({ text: `No product “${code}”`, ok: false });
    setQ(""); searchRef.current?.focus();
  }
  const setOverride = (sku: string, v: string) => setLines((p) => p.map((l) => (l.sku === sku ? { ...l, override: v } : l)));
  function pickCustomer(c: Cust) {
    setName(c.name); setPhone(c.phone);
    if (c.gstin) setGstin(c.gstin);
    setCustType(c.type === "wholesale" ? "wholesale" : "retail");
    setCustQ(""); setCustOpen(false);
  }
  function walkIn(type: "retail" | "wholesale") { setName(type === "wholesale" ? "Cash (W)" : "Cash (R)"); setPhone(""); setCustType(type); }

  const input = "w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";
  const router = useRouter();

  async function save() {
    if (!salesEmp) {
      setMsg('Pick who this quote is for under "Sold by" — or add their name — before saving.');
      return;
    }
    setBusy(true); setMsg("");
    const res = await createEstimateAction({
      items: lines.map((l) => ({ sku: l.sku, qty: l.qty, priceRupees: effUnit(l) / 100 })),
      customer: { name, phone },
      packingRupees: Number(packing) || 0, courierRupees: Number(courier) || 0, adjustmentRupees: Number(adjustment) || 0,
      salesEmployeeId: salesEmp,
      buyerGstin: gstin, buyerAddress: addr,
      mergeVariants, tier: custType,
    });
    setBusy(false);
    if (res.ok) {
      setMsg(`Estimate saved (${formatPaise(res.total ?? 0)}) — find it below to bill or hold.`);
      setLines([]); setName(""); setPhone(""); setGstin(""); setAddr(""); setCustType("retail");
      setPacking(""); setCourier(""); setAdjustment(""); setMergeVariants(false);
      router.refresh();
    } else setMsg(`${res.error}`);
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-card mb-4">
      <h2 className="font-medium text-ink mb-2">New estimate / quotation</h2>

      <div className="flex flex-wrap items-start gap-2 mb-3">
        <SoldByPicker employees={employees} value={salesEmp} onChange={setSalesEmp} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">Customer</span>
          <button type="button" onClick={() => walkIn("retail")} className={`text-xs px-3 py-1 rounded-full border ${name === "Cash (R)" ? "bg-emerald-mist border-emerald text-emerald-dark" : "border-sand text-muted hover:border-emerald"}`}>Cash (R)</button>
          <button type="button" onClick={() => walkIn("wholesale")} className={`text-xs px-3 py-1 rounded-full border ${name === "Cash (W)" ? "bg-wine/10 border-wine text-wine" : "border-sand text-muted hover:border-emerald"}`}>Cash (W)</button>
          <span title={custType === "wholesale" ? "Wholesale price" : "Retail price"} className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${custType === "wholesale" ? "bg-wine/10 text-wine" : "bg-emerald-mist text-emerald-dark"}`}>{TIER_LABEL[custType]}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {customers.length > 0 && (
          <div className="relative flex-1 min-w-[200px]">
            <input className={input} placeholder="Find existing customer by name / phone…" value={custQ}
              onChange={(e) => { setCustQ(e.target.value); setCustOpen(true); }} onFocus={() => setCustOpen(true)} />
            {custOpen && custQ.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
                {custMatches.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickCustomer(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-mist flex justify-between">
                    <span>{c.name} <span className="text-muted">· {c.phone || "no phone"}</span></span>
                    <span className={`text-xs ${c.type === "wholesale" ? "text-wine" : "text-muted"}`}>{TIER_LABEL[c.type] ?? "R"}</span>
                  </button>
                ))}
                {!custMatches.some((c) => (c.name ?? "").toLowerCase() === custQ.trim().toLowerCase()) && (
                  <button type="button" onClick={() => { setName(custQ.trim()); setCustQ(""); setCustOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-emerald-dark hover:bg-gold/10 border-t border-sand">+ Add “{custQ.trim()}” as a new customer</button>
                )}
              </div>
            )}
          </div>
        )}
        <input className={input + " flex-1 min-w-[160px]"} placeholder="Customer / firm name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input + " w-full sm:w-40"} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={input + " w-full sm:w-44"} placeholder="Buyer GSTIN (B2B)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
        <input className={input + " w-full"} placeholder="Buyer address (for GST bills)" value={addr} onChange={(e) => setAddr(e.target.value)} />
      </div>

      <div className="relative mb-2">
        <input ref={searchRef} className={input} placeholder="Scan a barcode, box QR, or search a product — press Enter" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }} />
        {matches.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
            {matches.map((p) => (
              <button key={p.sku} type="button" onClick={() => add(p)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-mist flex justify-between">
                <span>{p.name} <span className="text-muted">· {p.sku}</span> {p.qty != null && <span className={`text-[11px] ${p.qty <= 0 ? "text-rose" : "text-muted"}`}>({p.qty})</span>}</span>
                <span>{formatPaise(baseUnit(p))}</span>
              </button>
            ))}
          </div>
        )}
        {scanMsg && <p className={`text-[11px] mt-1 ${scanMsg.ok ? "text-emerald-dark" : "text-rose"}`}>{scanMsg.text}</p>}
      </div>
      {lines.map((l) => (
        <div key={l.sku} className="flex items-center gap-2 border-b border-sand/60 py-1.5 text-sm">
          <span className="flex-1 min-w-0 truncate">{l.name} <span className="text-muted">· {l.sku}</span>
            <span className={`ml-1 text-[10px] ${l.qty > l.stock ? "text-rose" : "text-muted"}`}>({l.stock})</span>
          </span>
          <label className="inline-flex items-center gap-0.5 rounded-full border border-sand px-2 py-1" title="Edit rate">
            <span className="text-muted text-xs">₹</span>
            <input value={l.override} onChange={(e) => setOverride(l.sku, e.target.value)} inputMode="decimal" placeholder={String(Math.round(baseUnit(l) / 100))}
              className={`w-16 text-right outline-none bg-transparent ${l.override.trim() !== "" ? "text-emerald-dark font-medium" : "text-ink"}`} />
          </label>
          <div className="inline-flex items-center rounded-full border border-sand overflow-hidden">
            <button type="button" onClick={() => setLines((p) => p.map((x) => (x.sku === l.sku ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="px-2.5 py-1 hover:bg-cream">−</button>
            <QtyField value={l.qty} onChange={(v) => setLines((p) => p.map((x) => (x.sku === l.sku ? { ...x, qty: v } : x)))} className="w-12 text-center border-x border-sand py-1 outline-none focus:bg-emerald-mist" />
            <button type="button" onClick={() => setLines((p) => p.map((x) => (x.sku === l.sku ? { ...x, qty: x.qty + 1 } : x)))} className="px-2.5 py-1 hover:bg-cream">+</button>
          </div>
          <span className="w-20 text-right font-medium">{formatPaise(effUnit(l) * l.qty)}</span>
          <button type="button" onClick={() => setLines((p) => p.filter((x) => x.sku !== l.sku))} className="text-muted hover:text-rose"><Icon g="✕" className="inline-block align-middle w-[1em] h-[1em]" /></button>
        </div>
      ))}
      {lines.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <label className="text-[11px] text-muted">Packing ₹<input value={packing} onChange={(e) => setPacking(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} mt-0.5`} /></label>
          <label className="text-[11px] text-muted">Courier ₹<input value={courier} onChange={(e) => setCourier(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} mt-0.5`} /></label>
          <label className="text-[11px] text-muted">Adjust ± ₹<input value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} mt-0.5`} /></label>
        </div>
      )}
      {lines.length > 0 && (
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-sand bg-cream/40 px-3 py-2 text-xs text-ink cursor-pointer">
          <input type="checkbox" checked={mergeVariants} onChange={(e) => setMergeVariants(e.target.checked)} className="mt-0.5" />
          <span>Merge colours on the bill <span className="text-muted">— print one line per product with quantities added up. Stock still moves per colour when billed.</span></span>
        </label>
      )}
      <div className="flex items-center justify-end gap-3 mt-3">
        <span className="text-lg font-semibold text-ink whitespace-nowrap">{formatPaise(total)}</span>
        <button type="button" onClick={save} disabled={busy || !lines.length} className="btn-primary px-5 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : "Save estimate"}</button>
      </div>
      {msg && <p className="text-sm mt-2 text-ink">{msg}</p>}
    </div>
  );
}
