"use client";
import { Icon } from "@/components/ui/Icon";
import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/pricing";
import { posSaleAction } from "@/app/actions/orders";
import { resolveSellableSku } from "@/app/actions/billing";
import { resolveBoxScanAction } from "@/app/actions/groups";
import { groupCodeFromScan, groupUnitsToAdd, parseGroupScan } from "@/lib/groupQr";
import { quickAddEmployeeAction } from "@/app/actions/employees";
import { QtyField } from "@/components/admin/QtyField";
import { skuCandidatesFromScan, looksLikeSkuScan } from "@/lib/scan";
import { buildSkuIndex, matchSku, suggestSkus } from "@/lib/skuMatch";
import { scanFeedback, scanSoundEnabled, setScanSoundEnabled } from "@/lib/scanFeedback";
import { CameraScanner } from "@/components/admin/CameraScanner";
import { useWedgeScanner } from "@/components/admin/useWedgeScanner";
import { usePosKeepalive } from "@/components/admin/usePosKeepalive";
import {
  enqueueScan,
  isTransientPosError,
  localBoxFromCatalog,
  localGroupFromIndex,
  recallGroupScan,
  rememberGroupScan,
  retryLookup,
} from "@/lib/posLookup";

type P = { sku: string; name: string; price: number; wholesale: number; mrp: number; category: string; qty: number };
type Line = { sku: string; name: string; price: number; wholesale: number; mrp: number; qty: number; stock: number; override: string; disc: string };
type Cust = { id: string; name: string; phone: string; type: string; gstin: string };
const TIER_LABEL: Record<string, string> = { retail: "R", wholesale: "W" };
type Method = { id: string; name: string; kind: string };
type Emp = { id: string; name: string };
type PayLine = { methodId: string; amount: string };

/** In-memory matching: exact SKU + old (renamed) SKUs. Separator-blind guesses are the server's
 *  call — this list can lag the database, so it can't prove a near-match is the only one. */
const LOCAL = { canonical: false } as const;

type ScanIndex = { aliases?: Record<string, string>; boxes?: Record<string, { sku: string; packQty: number }> };

export function POSClient({ products, customers = [], methods = [], employees = [], scanIndex = {} }: { products: P[]; customers?: Cust[]; methods?: Method[]; employees?: Emp[]; scanIndex?: ScanIndex }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scanMsg, setScanMsgState] = useState<{ text: string; ok: boolean } | null>(null);
  /** Every scan outcome is also heard: beep = on the bill, two-tone = check stock, buzz = not added. */
  const setScanMsg = (m: { text: string; ok: boolean } | null, sound?: "ok" | "warn" | "error") => {
    setScanMsgState(m);
    if (sound) scanFeedback(sound);
  };
  /** Close-match SKUs offered when a scan isn't found — one tap adds the right size. */
  const [scanSuggest, setScanSuggest] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => { setSoundOn(scanSoundEnabled()); }, []);
  const searchRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLInputElement>(null);
  const payRef = useRef<HTMLSelectElement>(null);
  const linesRef = useRef<Line[]>([]);
  const busyRef = useRef(false);
  const scanBusyRef = useRef(false);
  const scanQueueRef = useRef<string[]>([]);
  const lastScanRef = useRef({ code: "", at: 0 });
  const completeRef = useRef<() => void>(() => {});
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cust, setCust] = useState({ name: "", phone: "" });
  const [custType, setCustType] = useState<"retail" | "wholesale">("retail");
  const [salesEmp, setSalesEmp] = useState(""); // who dealt with the customer (performance attribution)
  // Local, editable roster so a staffer can add their name here and be selected immediately.
  const [emps, setEmps] = useState<Emp[]>(employees);
  const [addingEmp, setAddingEmp] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [empBusy, setEmpBusy] = useState(false);
  const empRef = useRef<HTMLSelectElement>(null);
  /** Add (or reuse) a salesperson by name from the POS box, then select them for this sale. */
  async function addEmp() {
    const n = newEmpName.trim();
    if (!n) return;
    setEmpBusy(true);
    const r = await quickAddEmployeeAction(n);
    setEmpBusy(false);
    if (r.ok && r.id) {
      setEmps((prev) => (prev.some((e) => e.id === r.id) ? prev : [...prev, { id: r.id!, name: r.name || n }]));
      setSalesEmp(r.id); setNewEmpName(""); setAddingEmp(false); setErr("");
    } else setErr(r.error ?? "Could not add employee");
  }
  const [custPanel, setCustPanel] = useState(false);
  const [billType, setBillType] = useState<"gst" | "cash">("gst");
  const [gstin, setGstin] = useState("");
  const [addr, setAddr] = useState("");
  const [globalDisc, setGlobalDisc] = useState("");
  const [packing, setPacking] = useState("");
  const [courier, setCourier] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const cashMethod = methods.find((m) => m.kind?.toLowerCase() === "cash");
  const [payLines, setPayLines] = useState<PayLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [allowBackorder, setAllowBackorder] = useState(false);
  // When on, the printed bill merges a product's colour variants into one line (qty summed).
  const [mergeVariants, setMergeVariants] = useState(false);
  // Live copy of the catalogue. The `products` prop is a snapshot taken when Billing was opened
  // (and AutoRefresh is deliberately off on this screen), so stock added later — purchase entry,
  // inventory add, another counter's sale — used to show as (0) here all day while Catalogue
  // showed the real count. The keepalive ping now brings back live counts every 2 minutes.
  const [catalog, setCatalog] = useState<P[]>(products);
  useEffect(() => { setCatalog(products); }, [products]);
  const applyStock = (stock: Record<string, number>) => {
    const qtyOf = (sku: string) => (typeof stock[sku] === "number" && Number.isFinite(stock[sku]) ? stock[sku] : undefined);
    setCatalog((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const q = qtyOf(p.sku);
        if (q === undefined || q === p.qty) return p;
        changed = true;
        return { ...p, qty: q };
      });
      return changed ? next : prev;
    });
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        const q = qtyOf(l.sku);
        if (q === undefined || q === l.stock) return l;
        changed = true;
        return { ...l, stock: q };
      });
      if (changed) linesRef.current = next;
      return changed ? next : prev;
    });
  };
  usePosKeepalive(applyStock);
  /** Before telling the counter a piece is OUT (or a box is short), confirm with the database —
   *  the in-memory count may be older than the latest stock entry. Only runs when the local
   *  count is too low, so normal in-stock scans stay instant and cost no server call. */
  async function confirmStock<T extends { sku: string; qty: number }>(item: T, need: number): Promise<T> {
    if (item.qty >= need) return item;
    try {
      const r = await retryLookup(() => resolveSellableSku(item.sku), { label: "stock", tries: 1, timeoutMs: 3000 });
      if (r.item && typeof r.item.qty === "number") {
        if (r.item.qty !== item.qty) applyStock({ [item.sku]: r.item.qty });
        return { ...item, qty: r.item.qty };
      }
    } catch { /* offline / cold start — fall back to the count we have */ }
    return item;
  }

  const pct = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100 ? n : 0; };
  const gDisc = pct(globalDisc);
  const baseUnit = (l: Line | P) => (custType === "wholesale" && l.wholesale > 0 ? l.wholesale : l.price);
  // rawUnit = the ORIGINAL unit rate shown in the Rate column (a manual override, else the tier rate).
  // It does NOT change when a discount is applied — the discount only affects the Amount.
  const rawUnit = (l: Line) => {
    const ov = l.override.trim();
    if (ov !== "" && Number.isFinite(Number(ov)) && Number(ov) >= 0) return Math.round(Number(ov) * 100);
    return baseUnit(l);
  };
  const lineDiscPct = (l: Line) => (l.disc.trim() !== "" ? pct(l.disc) : gDisc);
  // effUnit = the discounted unit that actually bills (Amount = effUnit × qty). Discount applies on
  // top of the Rate (override or tier), so Rate stays original and Amount reflects the discount.
  const effUnit = (l: Line) => {
    const d = lineDiscPct(l);
    const base = rawUnit(l);
    return d > 0 ? Math.round((base * (100 - d)) / 100) : base;
  };
  const mrpUnit = (l: Line) => Math.max(l.mrp || 0, rawUnit(l));

  const [custQ, setCustQ] = useState("");
  const custMatches = useMemo(() => {
    const s = custQ.trim().toLowerCase();
    if (!s) return [];
    return customers.filter((c) => (c.name ?? "").toLowerCase().includes(s) || (c.phone ?? "").includes(s)).slice(0, 6);
  }, [custQ, customers]);
  function pickCustomer(c: Cust) {
    setCust({ name: c.name, phone: c.phone });
    if (c.gstin) setGstin(c.gstin);
    setCustType(c.type === "wholesale" ? "wholesale" : "retail");
    if (c.type === "wholesale") setMergeVariants(true);
    setCustQ(""); setCustPanel(false);
  }
  function walkIn(type: "retail" | "wholesale") {
    setCust({ name: type === "wholesale" ? "Cash (W)" : "Cash (R)", phone: "" });
    setCustType(type); setCustPanel(false);
    if (type === "wholesale") setMergeVariants(true);
  }

  // Exact SKU → old (renamed) SKU, all in memory: an instant scan with no server trip.
  const skuIndex = useMemo(() => buildSkuIndex(catalog, scanIndex.aliases), [catalog, scanIndex.aliases]);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return catalog.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)).slice(0, 8);
  }, [q, catalog]);
  function findExact(codes: string[]) {
    return matchSku(skuIndex, codes, LOCAL)?.item;
  }

  const toPaise = (v: string) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
  const chargesTotal = Math.max(0, toPaise(packing)) + Math.max(0, toPaise(courier)) + toPaise(adjustment);
  const itemsTotal = lines.reduce((s, l) => s + effUnit(l) * l.qty, 0);
  const mrpTotal = lines.reduce((s, l) => s + mrpUnit(l) * l.qty, 0);
  const discountTotal = Math.max(0, mrpTotal - itemsTotal);
  const total = itemsTotal + chargesTotal;
  const GST_RATE = 3;
  const gstOnBill = billType === "gst" ? Math.round((total * GST_RATE) / 100) : 0;
  const grandTotal = total + gstOnBill;
  const pcsCount = lines.reduce((s, l) => s + l.qty, 0);
  const received = payLines.reduce((s, l) => s + (Number(l.amount) || 0) * 100, 0);
  const remaining = grandTotal - received;
  const addPayLine = () => setPayLines((p) => [...p, { methodId: methods[0]?.id ?? "", amount: "" }]);
  const setPayLine = (i: number, patch: Partial<PayLine>) => setPayLines((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  /** New and re-scanned lines jump to the top of the bill so the counter sees what just landed. */
  function bumpLine(prev: Line[], sku: string, create: () => Line, bump: (row: Line) => Line): Line[] {
    const i = prev.findIndex((l) => l.sku === sku);
    if (i < 0) return [create(), ...prev];
    const next = [...prev];
    const [row] = next.splice(i, 1);
    return [bump(row), ...next];
  }
  function addLine(p: P) {
    setLines((prev) => {
      const next = bumpLine(
        prev,
        p.sku,
        () => ({ sku: p.sku, name: p.name, price: p.price, wholesale: p.wholesale, mrp: p.mrp, qty: 1, stock: p.qty, override: "", disc: "" }),
        (row) => ({ ...row, qty: row.qty + 1, stock: p.qty }),
      );
      linesRef.current = next;
      return next;
    });
    setQ("");
  }
  /** Add N units of a piece at once — used when a box/group QR expands to its pack. */
  function addLineQty(p: P, n: number) {
    const add = Math.max(1, Math.floor(n));
    setLines((prev) => {
      const next = bumpLine(
        prev,
        p.sku,
        () => ({ sku: p.sku, name: p.name, price: p.price, wholesale: p.wholesale, mrp: p.mrp, qty: add, stock: p.qty, override: "", disc: "" }),
        (row) => ({ ...row, qty: row.qty + add, stock: p.qty }),
      );
      linesRef.current = next;
      return next;
    });
    setQ("");
  }
  function setQty(sku: string, qty: number) { setLines((p) => p.map((l) => l.sku === sku ? { ...l, qty: Math.max(1, Math.floor(qty || 1)) } : l)); }
  function setOverride(sku: string, val: string) { setLines((p) => p.map((l) => l.sku === sku ? { ...l, override: val } : l)); }
  function setLineDisc(sku: string, val: string) { setLines((p) => p.map((l) => l.sku === sku ? { ...l, disc: val } : l)); }
  function rm(sku: string) { setLines((p) => p.filter((l) => l.sku !== sku)); }

  /** Scanner payloads support product-page URLs, legacy space-separated SKU labels, and box QRs. */
  async function submitSearch(raw?: string) {
    const source = (raw ?? searchRef.current?.value ?? q).trim();
    if (!source) return;
    setScanSuggest([]);
    const parsed = parseGroupScan(source);
    if (parsed || groupCodeFromScan(source)) {
      const applyBox = (item: { sku: string; name: string; price: number; wholesale: number; mrp?: number; qty: number; category?: string }, packQty: number, cacheCode?: string) => {
        const alreadyInBill = linesRef.current.find((line) => line.sku === item.sku)?.qty ?? 0;
        const addN = groupUnitsToAdd(packQty, item.qty, alreadyInBill, allowBackorder);
        const available = Math.max(0, item.qty - alreadyInBill);
        if (addN <= 0) setScanMsg({ text: `${item.name}: no stock remaining for this bill`, ok: false }, "error");
        else {
          addLineQty({ sku: item.sku, name: item.name, price: item.price, wholesale: item.wholesale, mrp: item.mrp ?? item.price, category: item.category ?? "", qty: item.qty }, addN);
          const short = available < packQty;
          setScanMsg({ text: `Box · ${item.name} ×${addN}${short ? ` — only ${available} of ${packQty} remaining` : ""}`, ok: !short }, short ? "warn" : "ok");
        }
        if (cacheCode) {
          rememberGroupScan(cacheCode, {
            sku: item.sku, name: item.name, price: item.price, wholesale: item.wholesale,
            mrp: item.mrp ?? item.price, qty: item.qty, packQty,
          });
        }
        setQ(""); searchRef.current?.focus();
      };

      // Local/cached box hits use in-memory stock; if that looks short, re-check the DB first so a
      // restocked box isn't refused with "no stock remaining".
      const inBill = (sku: string) => linesRef.current.find((line) => line.sku === sku)?.qty ?? 0;
      const boxNeed = (sku: string, packQty: number) => (allowBackorder ? 0 : packQty + inBill(sku));

      const localBox = localBoxFromCatalog(source, findExact);
      if (localBox) {
        const item = await confirmStock(localBox.item, boxNeed(localBox.item.sku, localBox.packQty));
        applyBox(item, localBox.packQty, localBox.code);
        return;
      }

      // Every printed GRP- box is in the index loaded with this page — no server trip.
      const indexed = localGroupFromIndex(source, scanIndex.boxes, findExact);
      if (indexed) {
        const item = await confirmStock(indexed.item, boxNeed(indexed.item.sku, indexed.packQty));
        applyBox(item, indexed.packQty, indexed.code);
        return;
      }

      const cached = recallGroupScan(parsed?.code ?? groupCodeFromScan(source) ?? "");
      if (cached) {
        const live = findExact([cached.sku]);
        const item = await confirmStock(live ?? { ...cached, category: "" }, boxNeed(cached.sku, cached.packQty));
        applyBox(item, cached.packQty);
        return;
      }

      setScanMsg({ text: "Box…", ok: true });
      try {
        const r = await retryLookup(() => resolveBoxScanAction(source), { label: "box QR" });
        if (r.ok && r.item && r.packQty) {
          applyBox(r.item, r.packQty, parsed?.code ?? r.code);
          return;
        }
        setScanMsg({ text: r.error ?? "Box QR not recognised", ok: false }, "error");
      } catch (err) {
        setScanMsg({
          text: isTransientPosError(err)
            ? "Counter is waking up — scan that sticker once more."
            : "Box QR lookup failed. Scan once more.",
          ok: false,
        }, "error");
      }
      setQ(""); searchRef.current?.focus(); return;
    }
    const codes = skuCandidatesFromScan(source);
    const code = codes[0];
    if (!code) return;
    const announce = (p: P, note = "") => {
      addLine(p);
      // A sticker matched via an old SKU / different separators gets the two-tone "glance" cue.
      setScanMsg({ text: `${p.name} · ${p.qty} in stock${p.qty <= 0 ? " (OUT)" : ""}${note}`, ok: p.qty > 0 }, p.qty > 0 && !note ? "ok" : "warn");
    };
    const hit = matchSku(skuIndex, codes, LOCAL);
    if (hit) {
      const exact = await confirmStock(hit.item, (linesRef.current.find((l) => l.sku === hit.item.sku)?.qty ?? 0) + 1);
      announce(exact, hit.via === "exact" ? "" : ` · sticker ${code} → ${exact.sku}`);
      searchRef.current?.focus();
      return;
    }
    setScanMsg({ text: "Looking up…", ok: true });
    let found: P | null = null;
    let via: string | undefined;
    let lookupError: string | undefined;
    let suggestions: string[] = [];
    try {
      // The server tries every spelling, old SKUs and separator-blind matches in one call.
      const result = await retryLookup(() => resolveSellableSku(source), { label: "SKU" });
      if (result.item) { found = result.item; via = result.via; }
      else { lookupError = result.error; suggestions = result.suggestions ?? []; }
    } catch (err) {
      lookupError = isTransientPosError(err)
        ? "Counter is waking up — scan that sticker once more."
        : "Product lookup failed. Scan once more.";
    }
    const allowNameFallback = !looksLikeSkuScan(source) && !lookupError;
    const p = found ?? (allowNameFallback ? matches[0] : undefined);
    if (p) announce(p, via && via !== "exact" ? ` · sticker ${code} → ${p.sku}` : "");
    else {
      if (!suggestions.length && !lookupError) suggestions = suggestSkus(catalog, source);
      setScanMsg({ text: lookupError ?? (suggestions.length ? `No product “${code}” — tap the right one below` : `No product “${code}”`), ok: false }, "error");
      setScanSuggest(suggestions);
    }
    setQ(""); searchRef.current?.focus();
  }

  function ingestScan(raw: string) {
    enqueueScan(raw, lastScanRef, scanQueueRef, scanBusyRef, submitSearch);
  }
  useWedgeScanner(ingestScan, searchRef);

  async function complete() {
    if (busyRef.current || lines.length === 0) return;
    if (!salesEmp) {
      setErr('Pick who made this sale under "Sold by" — or add their name — before recording the bill.');
      setAddingEmp(emps.length === 0);
      empRef.current?.focus();
      return;
    }
    busyRef.current = true; setBusy(true); setErr("");
    try {
    const validPays = payLines.filter((l) => l.methodId && (Number(l.amount) || 0) > 0).map((l) => ({ methodId: l.methodId, amount: Number(l.amount) || 0 }));
    const res = await posSaleAction({
      items: lines.map((l) => {
        const ov = l.override.trim();
        const hasOv = ov !== "" && Number.isFinite(Number(ov)) && Number(ov) >= 0;
        const d = lineDiscPct(l);
        if (hasOv || d > 0) return { sku: l.sku, qty: l.qty, priceRupees: effUnit(l) / 100, listRupees: rawUnit(l) / 100 };
        return { sku: l.sku, qty: l.qty };
      }),
      customer: cust, payment: "cash",
      billType, buyerGstin: billType === "gst" ? gstin : "", buyerAddress: addr,
      ...(validPays.length ? { payments: validPays } : {}),
      allowOversell: allowBackorder, tier: custType, salesEmployeeId: salesEmp || undefined,
      backorder: allowBackorder && lines.some((l) => l.qty > l.stock),
      packingRupees: Number(packing) || 0, courierRupees: Number(courier) || 0, adjustmentRupees: Number(adjustment) || 0,
      mergeVariants,
    });
    if (!res.ok) {
      if (res.orderId) {
        router.push(`/admin/invoice/${res.orderId}?save=attention`);
        return;
      }
      setErr(res.error ?? "Failed");
      return;
    }
    router.push(`/admin/invoice/${res.orderId}${res.warning ? "?save=warning" : ""}`);
    } catch {
      setErr("Billing request could not be completed. Check whether a sale was created before trying again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  completeRef.current = complete;

  // ---- keyboard-first shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "F2") { e.preventDefault(); setCustPanel((v) => !v); }
      else if (e.key === "F5") { e.preventDefault(); setMoreOpen(true); setTimeout(() => discRef.current?.focus(), 0); }
      else if (e.key === "F4") { e.preventDefault(); if (methods.length && payLines.length === 0) addPayLine(); setTimeout(() => payRef.current?.focus(), 0); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); completeRef.current(); }
      else if (e.key === "Escape") { setCustPanel(false); setScanMsg(null); setScanSuggest([]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [methods.length, payLines.length]);

  const inp = "rounded-lg border border-sand bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald";
  return (
    <div className="flex flex-col gap-3" data-no-autorefresh data-pos-live>
      {/* ================= TOP BAR ================= */}
      <div className="bg-white rounded-2xl shadow-card p-3 flex flex-wrap items-center gap-3">
        {/* Bill type */}
        <div className="inline-flex rounded-lg border border-sand overflow-hidden text-sm shrink-0">
          {([["gst", "GST Invoice"], ["cash", "Final Estimate"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setBillType(v)} className={`px-3 py-2 transition-colors ${billType === v ? "bg-ink text-white" : "text-muted hover:bg-cream"}`}>{label}</button>
          ))}
        </div>

        {/* Unified product search + scan (F3, autofocus) */}
        <div className="relative flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 rounded-xl border-2 border-emerald/40 bg-emerald-mist/30 px-4 py-3">
            <span className="text-emerald text-lg">▥</span>
            <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ingestScan(searchRef.current?.value ?? q); } }}
              placeholder="Scan barcode, or search SKU / product / category… (F3)"
              className="flex-1 bg-transparent outline-none text-base placeholder:text-emerald-dark/50" />
            <kbd className="text-[10px] text-emerald-dark/60 border border-emerald/30 rounded px-1">Enter</kbd>
            <button type="button" onClick={() => setCameraOpen(true)} title="Scan with this device's camera"
              className="text-xs px-2 py-1 rounded-lg border border-emerald/40 text-emerald-dark hover:bg-emerald-mist whitespace-nowrap">Camera</button>
            <button type="button" onClick={() => { const on = !soundOn; setScanSoundEnabled(on); setSoundOn(on); if (on) scanFeedback("ok"); }}
              title={soundOn ? "Scan sounds on — click to mute" : "Scan sounds off — click to turn on"} aria-pressed={soundOn}
              className={`text-xs px-2 py-1 rounded-lg border whitespace-nowrap ${soundOn ? "border-emerald/40 text-emerald-dark" : "border-sand text-muted line-through"}`}>Beep</button>
          </div>
          {matches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
              {matches.map((p) => (
                <button type="button" key={p.sku} onClick={() => { addLine(p); if (p.qty <= 0) void confirmStock(p, 1); searchRef.current?.focus(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-mist flex justify-between items-center">
                  <span className="truncate">{p.name} <span className="text-muted">· {p.sku}</span> <span className={`text-[11px] ${p.qty <= 0 ? "text-rose" : "text-muted"}`}>({p.qty})</span></span>
                  <span className="text-ink shrink-0 ml-2">{formatPaise(baseUnit(p))}</span>
                </button>
              ))}
            </div>
          )}
          {scanMsg && <p role="status" aria-live="polite" className={`text-xs font-medium mt-0.5 absolute ${scanMsg.ok ? "text-emerald-dark" : "text-rose"}`}>{scanMsg.text}</p>}
          {scanSuggest.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-5 bg-white rounded-xl shadow-luxe border border-rose/30 p-2 flex flex-wrap gap-1.5">
              {scanSuggest.map((sku) => {
                const p = skuIndex.exact.get(sku.toLowerCase());
                return (
                  <button type="button" key={sku} onClick={() => { setScanSuggest([]); ingestScan(sku); }}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-sand hover:border-emerald hover:bg-emerald-mist">
                    <span className="font-mono">{sku}</span>{p ? <span className="text-muted"> · {p.name} ({p.qty})</span> : null}
                  </button>
                );
              })}
              <button type="button" onClick={() => setScanSuggest([])} className="text-xs px-2 py-1.5 text-muted hover:text-rose" aria-label="Dismiss suggestions">✕</button>
            </div>
          )}
          {cameraOpen && <CameraScanner onScan={ingestScan} onClose={() => { setCameraOpen(false); searchRef.current?.focus(); }} />}
        </div>

        {/* Salesperson (employee sales attribution) — REQUIRED so every bill is tracked. Staff can
            pick from the roster or add their own name on the spot. */}
        <div className="shrink-0">
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${salesEmp ? "border-emerald" : "border-gold"}`}>
            <span className="text-muted text-xs whitespace-nowrap inline-flex items-center gap-1"><Icon g="☺" className="w-3.5 h-3.5" />Sold by<span className="text-rose" title="Required">*</span></span>
            <select ref={empRef} value={salesEmp} onChange={(e) => setSalesEmp(e.target.value)} className="bg-transparent outline-none text-ink max-w-[130px]">
              <option value="">— select —</option>
              {emps.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <button type="button" onClick={() => setAddingEmp((v) => !v)} className="text-emerald-dark text-xs hover:underline whitespace-nowrap" title="Add a new salesperson"><Icon g="＋" className="inline-block align-middle w-[1em] h-[1em]" />New</button>
          </div>
          {addingEmp && (
            <div className="mt-1 flex items-center gap-1">
              <input value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmp(); } }}
                placeholder="Type your name" autoFocus
                className="rounded-lg border border-sand px-2 py-1 text-xs w-32 outline-none focus:border-emerald" />
              <button type="button" onClick={addEmp} disabled={empBusy || !newEmpName.trim()}
                className="text-xs px-2 py-1 rounded-lg bg-ink text-white disabled:opacity-50">{empBusy ? "…" : "Add"}</button>
            </div>
          )}
        </div>

        {/* Compact customer chip (F2) */}
        <div className="relative shrink-0">
          <button onClick={() => setCustPanel((v) => !v)} className="flex items-center gap-2 rounded-xl border border-sand px-3 py-2 text-sm hover:border-emerald">
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${custType === "wholesale" ? "bg-wine/10 text-wine" : "bg-emerald-mist text-emerald-dark"}`}>{TIER_LABEL[custType]}</span>
            <span className="text-ink max-w-[160px] truncate">{cust.name || "Walk-in customer"}</span>
            {cust.phone && <span className="text-muted text-xs">· {cust.phone}</span>}
            <span className="text-muted text-xs">▾ <span className="text-[10px]">F2</span></span>
          </button>
          {custPanel && (
            <div className="absolute z-30 right-0 mt-1 w-80 bg-white rounded-xl shadow-luxe border border-sand p-3 space-y-2">
              <div className="flex gap-2">
                <button onClick={() => walkIn("retail")} className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-sm hover:border-emerald">Cash (R)</button>
                <button onClick={() => walkIn("wholesale")} className="flex-1 rounded-lg border border-sand px-3 py-1.5 text-sm hover:border-emerald">Cash (W)</button>
              </div>
              {customers.length > 0 && (
                <div className="relative">
                  <input autoFocus className={`${inp} w-full`} placeholder=" Find customer by name / phone…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                  {custQ.trim() && (
                    <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-sand divide-y divide-sand/60">
                      {custMatches.map((c) => (
                        <button key={c.id} onClick={() => pickCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-mist flex justify-between">
                          <span className="truncate">{c.name} <span className="text-muted">· {c.phone || "no phone"}</span></span>
                          <span className={`text-xs ${c.type === "wholesale" ? "text-wine" : "text-muted"}`}>{TIER_LABEL[c.type] ?? "R"}</span>
                        </button>
                      ))}
                      {!custMatches.some((c) => (c.name ?? "").toLowerCase() === custQ.trim().toLowerCase()) && (
                        <button onClick={() => { setCust({ name: custQ.trim(), phone: "" }); setCustQ(""); setCustPanel(false); }} className="w-full text-left px-3 py-2 text-sm text-emerald-dark hover:bg-gold/10">+ Add “{custQ.trim()}”</button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <input className={`${inp} w-full`} placeholder="Name (override)" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
              <input className={`${inp} w-full`} placeholder="Phone (optional)" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
              {billType === "gst" && <input className={`${inp} w-full`} placeholder="Buyer GSTIN (B2B)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />}
              <button onClick={() => setCustPanel(false)} className="w-full py-1.5 rounded-lg bg-ink text-white text-sm">Done</button>
            </div>
          )}
        </div>
      </div>

      {/* ================= PRODUCT TABLE (center, largest) ================= */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead className="bg-cream text-muted text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-24">SKU</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-2 py-2 w-28 text-center">Qty</th>
                <th className="px-2 py-2 w-24 text-right">Rate ₹</th>
                <th className="px-2 py-2 w-16 text-right">Disc %</th>
                <th className="px-3 py-2 w-24 text-right">Amount</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Scan or search above to add items. <kbd className="text-[10px] border border-sand rounded px-1">F3</kbd> jumps to search.</td></tr>
              )}
              {lines.map((l) => {
                const over = l.qty > l.stock;
                return (
                  <Fragment key={l.sku}>
                    <tr className="border-t border-sand/60 hover:bg-cream/30">
                      <td className="px-3 py-1.5 font-mono text-xs text-muted align-middle">{l.sku}</td>
                      <td className="px-3 py-1.5 align-middle">
                        <button onClick={() => setExpanded(expanded === l.sku ? null : l.sku)} className="text-left text-ink hover:text-emerald flex items-center gap-1">
                          <span className="truncate max-w-[240px]">{l.name}</span>
                          <span className={`text-[10px] px-1 rounded ${over ? "bg-rose/10 text-rose" : "text-muted"}`}>{l.stock}{over ? "" : ""}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="inline-flex items-center rounded-lg border border-sand overflow-hidden mx-auto">
                          <button onClick={() => setQty(l.sku, l.qty - 1)} className="px-3 py-1.5 text-lg leading-none hover:bg-cream" aria-label="−">−</button>
                          <QtyField value={l.qty} onChange={(n) => setQty(l.sku, n)} className="w-12 text-center border-x border-sand py-1.5 outline-none focus:bg-emerald-mist" />
                          <button onClick={() => setQty(l.sku, l.qty + 1)} className="px-3 py-1.5 text-lg leading-none hover:bg-cream" aria-label="+">+</button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle">
                        <input value={l.override} onChange={(e) => setOverride(l.sku, e.target.value)} inputMode="decimal" placeholder={String(Math.round(baseUnit(l) / 100))}
                          className={`w-24 text-right rounded-lg border border-sand/60 hover:border-sand focus:border-emerald px-2 py-1.5 outline-none ${l.override.trim() !== "" ? "text-emerald-dark font-medium" : "text-ink"}`} />
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle">
                        <input value={l.disc} onChange={(e) => setLineDisc(l.sku, e.target.value)} inputMode="decimal" placeholder={gDisc > 0 ? String(gDisc) : "0"}
                          className={`w-14 text-right rounded-lg border border-sand/60 hover:border-sand focus:border-emerald px-2 py-1.5 outline-none ${pct(l.disc) > 0 ? "text-emerald-dark font-medium" : "text-ink"}`} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium align-middle">{formatPaise(effUnit(l) * l.qty)}</td>
                      <td className="px-2 py-1.5 align-middle text-right">
                        <button onClick={() => rm(l.sku)} title="Remove" className="text-muted hover:text-rose text-xs"><Icon g="✕" className="inline-block align-middle w-[1em] h-[1em]" /></button>
                      </td>
                    </tr>
                    {expanded === l.sku && (
                      <tr className="bg-cream/40 text-xs text-muted">
                        <td></td>
                        <td colSpan={6} className="px-3 py-1.5">
                          Stock <b className="text-ink">{l.stock}</b> · MRP <b className="text-ink">{formatPaise(mrpUnit(l))}</b>
                          {mrpUnit(l) > effUnit(l) && <span className="text-emerald-dark"> · saves {formatPaise(mrpUnit(l) - effUnit(l))}/pc</span>}
                          <span> · Wholesale {formatPaise(l.wholesale || l.price)}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= BOTTOM: charges (left) + totals & payment (right, sticky) ================= */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-3 items-start">
        {/* Charges / discount / notes — low priority, collapsed */}
        <div className="bg-white rounded-2xl shadow-card p-3">
          <button onClick={() => setMoreOpen((v) => !v)} className="flex items-center justify-between w-full text-sm font-medium text-ink">
            <span>Discount &amp; charges <span className="text-muted font-normal text-xs">— global disc, packing, courier, adjust {billType === "gst" ? "· buyer address" : ""}</span></span>
            <span className="text-muted text-xs">{moreOpen ? "▲" : "▼ F5"}</span>
          </button>
          {moreOpen && (
            <div className="mt-3 grid sm:grid-cols-4 gap-2">
              <label className="text-[11px] text-muted">Global disc %<input ref={discRef} value={globalDisc} onChange={(e) => setGlobalDisc(e.target.value)} inputMode="decimal" placeholder="0" className={`${inp} w-full mt-0.5`} /></label>
              <label className="text-[11px] text-muted">Packing ₹<input value={packing} onChange={(e) => setPacking(e.target.value)} inputMode="decimal" placeholder="0" className={`${inp} w-full mt-0.5`} /></label>
              <label className="text-[11px] text-muted">Courier ₹<input value={courier} onChange={(e) => setCourier(e.target.value)} inputMode="decimal" placeholder="0" className={`${inp} w-full mt-0.5`} /></label>
              <label className="text-[11px] text-muted">Adjust ± ₹<input value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputMode="decimal" placeholder="0" className={`${inp} w-full mt-0.5`} /></label>
              {billType === "gst" && <label className="text-[11px] text-muted sm:col-span-4">Buyer address<textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} className={`${inp} w-full mt-0.5`} /></label>}
            </div>
          )}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 text-xs text-ink cursor-pointer">
            <input type="checkbox" checked={allowBackorder} onChange={(e) => setAllowBackorder(e.target.checked)} className="mt-0.5" />
            <span>Allow backorder — bill even if a scan or box is out of stock. Unticked, oversell is blocked.</span>
          </label>
        </div>

        {/* Totals + payment — sticky while scrolling the bill */}
        <div className="bg-white rounded-2xl shadow-card p-4 sticky top-3 space-y-1.5 relative z-10 mb-24">
          <div className="flex justify-between text-sm"><span className="text-muted">Total MRP</span><span className="text-ink/80">{formatPaise(mrpTotal)}</span></div>
          {discountTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted">Discount</span><span className="text-emerald-dark">− {formatPaise(discountTotal)}</span></div>}
          <div className="flex justify-between text-sm"><span className="text-muted">Net (items)</span><span className="text-ink/80">{formatPaise(itemsTotal)}</span></div>
          {chargesTotal !== 0 && <div className="flex justify-between text-sm"><span className="text-muted">Other charges</span><span className="text-ink/80">{chargesTotal > 0 ? "+ " : ""}{formatPaise(chargesTotal)}</span></div>}
          {gstOnBill > 0 && <div className="flex justify-between text-sm"><span className="text-muted">GST @{GST_RATE}%</span><span className="text-ink/80">+ {formatPaise(gstOnBill)}</span></div>}
          <div className="flex justify-between items-baseline pt-1.5 border-t border-sand/60"><span className="text-muted">Payable</span><span className="text-2xl font-semibold text-ink">{formatPaise(grandTotal)}</span></div>

          {/* Payment (F4) */}
          <div className="pt-2">
            <p className="text-[11px] text-muted mb-1">Payment <span className="text-muted/70">— empty = paid in full cash</span> <span className="text-[10px]">F4</span></p>
            {methods.length === 0 ? (
              <p className="text-[11px] text-muted bg-cream/60 rounded-lg px-2 py-1.5">Add methods in Bank &amp; Payment Methods.</p>
            ) : (
              <div className="space-y-1.5">
                {payLines.map((l, idx) => (
                  <div key={idx} className="flex gap-1.5">
                    <select ref={idx === 0 ? payRef : undefined} value={l.methodId} onChange={(e) => setPayLine(idx, { methodId: e.target.value })} className={`${inp} flex-1`}>
                      <option value="">Method…</option>
                      {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input value={l.amount} onChange={(e) => setPayLine(idx, { amount: e.target.value })} inputMode="numeric" placeholder="₹0" className={`${inp} w-24`} />
                    <button onClick={() => setPayLines((p) => p.filter((_, i) => i !== idx))} className="px-1 text-muted hover:text-rose"><Icon g="✕" className="inline-block align-middle w-[1em] h-[1em]" /></button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={addPayLine} className="text-[11px] px-2.5 py-1 rounded-full border border-sand text-ink hover:border-emerald">+ Split</button>
                  {cashMethod && <button onClick={() => setPayLines([{ methodId: cashMethod.id, amount: String(Math.round(grandTotal / 100)) }])} className="text-[11px] px-2.5 py-1 rounded-full border border-sand text-muted hover:border-emerald">All cash</button>}
                  {payLines.length > 0 && remaining > 0 && (
                    <button onClick={() => setPayLine(payLines.length - 1, { amount: String((((Number(payLines[payLines.length - 1].amount) || 0) * 100 + remaining) / 100)) })} className="text-[11px] px-2.5 py-1 rounded-full border border-sand text-muted hover:border-emerald">Fill {formatPaise(remaining)}</button>
                  )}
                </div>
              </div>
            )}
            {received > 0 && (
              <p className={`text-[11px] mt-1 text-right ${remaining > 0 ? "text-rose" : "text-emerald-dark"}`}>
                Received {formatPaise(received)}{remaining > 0 ? ` · due ${formatPaise(remaining)}` : remaining < 0 ? ` · change ${formatPaise(-remaining)}` : " · settled"}
              </p>
            )}
          </div>

          {err && <p className="text-sm text-rose">{err}</p>}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-sand bg-cream/40 px-3 py-2 text-xs text-ink cursor-pointer">
            <input type="checkbox" checked={mergeVariants} onChange={(e) => setMergeVariants(e.target.checked)} className="mt-0.5" />
            <span>Merge colours on the bill <span className="text-muted">— print one line per product with quantities added up (e.g. 3 blue + 4 yellow + 5 pink → “Necklace ×12”). Stock still moves per colour.</span></span>
          </label>
          <button type="button" onClick={complete} disabled={busy || lines.length === 0} className="btn-primary w-full mt-2 py-4 text-base font-semibold disabled:opacity-50 relative z-10">
            {busy ? "Completing…" : (billType === "gst" ? "Generate tax invoice" : "Generate final estimate")} <span className="text-[10px] opacity-70">Ctrl+↵</span>
          </button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="no-print pointer-events-none fixed bottom-16 left-4 right-16 lg:left-[17rem] z-40">
          <div className="pointer-events-auto bg-ink text-cream rounded-2xl shadow-luxe px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="text-cream/70">{lines.length} product{lines.length === 1 ? "" : "s"} · {pcsCount} pc{pcsCount === 1 ? "" : "s"}</span>
              <span className="ml-3 text-lg font-semibold text-ivory">{formatPaise(grandTotal)}</span>
            </p>
            <button type="button" onClick={complete} disabled={busy || lines.length === 0} className="btn-gold px-4 py-2 text-sm font-medium disabled:opacity-50">
              {busy ? "Saving…" : "Complete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
