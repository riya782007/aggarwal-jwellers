"use client";
import { Icon } from "@/components/ui/Icon";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/pricing";
import { recordPurchaseAction } from "@/app/actions/purchases";
import { createProductForPurchaseAction } from "@/app/actions/catalog";
import { compressImage } from "@/lib/image";

type Sup = { id: string; name: string; city: string | null };
type Variant = { id: string; sku: string; label: string };
type Prod = { id: string; name: string; sku: string; variants?: Variant[] };
type Cat = { id: string; name: string };
type Sub = { id: string; name: string; categoryId: string };
type Line = {
  supplierSku: string; mappedProductId: string; mappedName: string; variantId: string; qty: string; cost: string;
  // Inline "create a brand-new product" mode (so a just-arrived design can be sold at the counter now).
  isNew?: boolean;
  newName?: string; newCategoryId?: string; newSubId?: string; newSku?: string;
  newWholesale?: string; newRetail?: string; newImage?: File | null;
};

type LastCosts = { byProduct: Record<string, number>; byVariant: Record<string, number> };

const fileToB64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = rej; r.readAsDataURL(f);
});

export function PurchaseClient({ suppliers, products, lastCosts, categories = [], subcategories = [] }: { suppliers: Sup[]; products: Prod[]; lastCosts?: LastCosts; categories?: Cat[]; subcategories?: Sub[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [lines, setLines] = useState<Line[]>([{ supplierSku: "", mappedProductId: "", mappedName: "", variantId: "", qty: "", cost: "" }]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmDup, setConfirmDup] = useState(false);
  const [labelSkus, setLabelSkus] = useState<string[]>([]); // after recording → offer to print labels for these
  const [pay, setPay] = useState<{ cash: string; upi: string; bank: string }>({ cash: "", upi: "", bank: "" });

  const input = "rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";
  const set = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const variantById = useMemo(() => { const m = new Map<string, Variant>(); for (const p of products) for (const v of (p.variants ?? [])) m.set(v.id, v); return m; }, [products]);

  const expandColours = (i: number) => setLines((prev) => {
    const line = prev[i];
    const vs = products.find((p) => p.id === line.mappedProductId)?.variants ?? [];
    if (!vs.length) return prev;
    const rows = vs.map((v) => ({ ...line, variantId: v.id, qty: "" }));
    return [...prev.slice(0, i), ...rows, ...prev.slice(i + 1)];
  });
  const suggest = (q: string) => q.trim() ? products.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

  const METHODS = [["cash", "Cash"], ["upi", "UPI"], ["bank", "Bank"]] as const;
  const paidNow = (Number(pay.cash) || 0) + (Number(pay.upi) || 0) + (Number(pay.bank) || 0);
  const credit = Math.max(0, total - paidNow);
  const over = paidNow > total && total > 0;
  const fillRemaining = (m: "cash" | "upi" | "bank") => setPay((s) => {
    const others = (["cash", "upi", "bank"] as const).filter((k) => k !== m).reduce((n, k) => n + (Number(s[k]) || 0), 0);
    const rem = Math.max(0, total - others);
    return { ...s, [m]: rem ? String(rem) : "" };
  });

  // Turn a line into a "create new product" line (prefill the name from what they typed).
  const startNew = (i: number) => { setOpenIdx(null); set(i, { isNew: true, mappedProductId: "", mappedName: "", variantId: "", newName: lines[i].supplierSku.trim(), newCategoryId: categories[0]?.id ?? "", newSubId: "", newSku: "", newWholesale: "", newRetail: "" }); };
  const cancelNew = (i: number) => set(i, { isNew: false, newName: "", newCategoryId: "", newSubId: "", newSku: "", newWholesale: "", newRetail: "", newImage: null });
  const subsFor = (catId?: string) => subcategories.filter((s) => s.categoryId === catId);

  async function submit(force = false) {
    // Mapped products that HAVE colours must be bought as a specific colour — never the parent.
    const missing = lines.find((l) => {
      if (l.isNew || !l.mappedProductId || !(Number(l.qty) > 0)) return false;
      const hasVariants = (products.find((p) => p.id === l.mappedProductId)?.variants ?? []).length > 0;
      return hasVariants && !l.variantId;
    });
    if (missing) { setMsg(`Pick a colour for "${missing.mappedName}" — products with colours are bought per colour, not as the whole product.`); return; }
    // New-product lines need the essentials.
    for (const l of lines) {
      if (l.isNew && Number(l.qty) > 0) {
        if (!l.newName?.trim()) { setMsg("Name the new product on the highlighted line."); return; }
        if (!l.newCategoryId) { setMsg("Pick a category for the new product."); return; }
        if (!(Number(l.newWholesale) > 0)) { setMsg("Enter a wholesale price for the new product."); return; }
      }
    }
    if (over) { setMsg(`Paid ${formatPaise(paidNow * 100)} is more than the bill total ${formatPaise(total * 100)} — reduce a method.`); return; }
    setBusy(true); setMsg(""); setLabelSkus([]); if (!force) setConfirmDup(false);

    // 1) Create any brand-new products first, then map each purchase line to the created product.
    const resolved = [...lines];
    const createdSku: Record<number, string> = {};
    try {
      for (let i = 0; i < resolved.length; i++) {
        const l = resolved[i];
        if (!l.isNew || !(Number(l.qty) > 0)) continue;
        let imageBase64: string | undefined, imageMime: string | undefined;
        if (l.newImage) { const small = await compressImage(l.newImage); imageBase64 = await fileToB64(small); imageMime = small.type || "image/jpeg"; }
        const cr = await createProductForPurchaseAction({
          name: l.newName!.trim(), categoryId: l.newCategoryId!, subcategoryId: l.newSubId || undefined,
          sku: l.newSku?.trim() || undefined, wholesaleRupees: Number(l.newWholesale),
          retailRupees: l.newRetail ? Number(l.newRetail) : undefined, imageBase64, imageMime,
        });
        if (!cr.ok || !cr.productId) { setBusy(false); setMsg(cr.error ?? "Could not create the new product."); return; }
        resolved[i] = { ...l, mappedProductId: cr.productId, variantId: "" };
        createdSku[i] = cr.sku!;
      }
    } catch { setBusy(false); setMsg("Could not create the new product — check the photo and try again."); return; }

    // 2) Record the purchase (adds stock + books cost) against the resolved product ids.
    const payments = METHODS.map(([m]) => ({ mode: m, amountRupees: Number(pay[m]) || 0 })).filter((p) => p.amountRupees > 0);
    const res = await recordPurchaseAction({
      supplierId, billNo, force,
      items: resolved.map((l, i) => ({ supplierSku: l.isNew ? (createdSku[i] ?? l.supplierSku) : l.supplierSku, mappedProductId: l.mappedProductId, variantId: l.variantId, qty: Number(l.qty) || 0, unitCostRupees: Number(l.cost) || 0 })),
      payments,
    });
    setBusy(false);
    if (res.ok) {
      // 3) Queue every purchased item for the Label module (variant sku if per-colour, else product sku).
      const skuOf = (l: Line, i: number): string | null => {
        if (createdSku[i]) return createdSku[i];
        if (l.variantId) return variantById.get(l.variantId)?.sku ?? null;
        if (l.mappedProductId) return products.find((p) => p.id === l.mappedProductId)?.sku ?? null;
        return null;
      };
      const printSkus = [...new Set(resolved.map((l, i) => skuOf(l, i)).filter(Boolean) as string[])];
      setLabelSkus(printSkus);
      const owed = Math.max(0, total - paidNow);
      setMsg(`Purchase recorded (${formatPaise(res.total ?? 0)})${owed > 0 ? ` — ${formatPaise(owed * 100)} on credit to supplier` : " — paid in full"}. Stock updated.`);
      setLines([{ supplierSku: "", mappedProductId: "", mappedName: "", variantId: "", qty: "", cost: "" }]); setBillNo(""); setPay({ cash: "", upi: "", bank: "" }); setConfirmDup(false); router.refresh();
    }
    else { setMsg(`${res.error}`); setConfirmDup(!!res.duplicateBillNo); }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-card mb-6">
      {/* After recording — one click to print stickers for everything on the bill. */}
      {labelSkus.length > 0 && (
        <div className="bg-emerald-mist border border-emerald/30 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm text-emerald-dark">Recorded {labelSkus.length} item{labelSkus.length === 1 ? "" : "s"}. Print their barcode stickers now?</p>
          <div className="flex items-center gap-2">
            <Link href={`/admin/barcodes?skus=${encodeURIComponent(labelSkus.join(","))}`} target="_blank" className="btn-primary px-5 py-2 text-sm font-medium"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print labels</Link>
            <button type="button" onClick={() => setLabelSkus([])} className="px-4 py-2 text-sm rounded-full border border-sand text-muted hover:text-ink">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <select className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Select supplier…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>)}
        </select>
        <input className={input} placeholder="Supplier bill no." value={billNo} onChange={(e) => setBillNo(e.target.value)} />
      </div>

      <p className="text-xs text-muted mb-2">Type the supplier&apos;s item name/code — we suggest your internal SKU. Map it, create it as a <b>new product</b> right here, or leave unmapped to skip the stock update.</p>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="space-y-2">
            <div className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-5 relative">
                <input className={input + " w-full"} placeholder="Supplier item / code" value={l.supplierSku}
                  onChange={(e) => { set(i, { supplierSku: e.target.value }); setOpenIdx(i); }} onFocus={() => setOpenIdx(i)} disabled={l.isNew} />
                {l.isNew ? (
                  <p className="text-[11px] text-emerald-dark mt-0.5"><Icon g="✦" className="inline-block align-middle w-[1em] h-[1em]" /> New product: <b>{l.newName || "…"}</b> <button onClick={() => cancelNew(i)} className="text-muted underline ml-1">cancel</button></p>
                ) : l.mappedName ? (
                  <>
                    <p className="text-[11px] text-emerald-dark mt-0.5"><Icon g="→" className="inline-block align-middle w-[1em] h-[1em]" /> {l.mappedName} <button onClick={() => set(i, { mappedProductId: "", mappedName: "", variantId: "" })} className="text-muted underline ml-1">change</button></p>
                    {(() => {
                      const vs = products.find((p) => p.id === l.mappedProductId)?.variants ?? [];
                      if (!vs.length) return null;
                      return (
                        <div className="mt-1 flex items-center gap-1.5">
                          <select className={`${input} flex-1 text-xs ${l.variantId ? "" : "border-rose text-rose"}`} value={l.variantId} onChange={(e) => set(i, { variantId: e.target.value })}>
                            <option value="" disabled>Choose colour / variant…</option>
                            {vs.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.sku}</option>)}
                          </select>
                          {vs.length > 1 && (
                            <button type="button" onClick={() => expandColours(i)} className="shrink-0 text-[11px] px-2 py-1.5 rounded-lg bg-emerald-mist text-emerald-dark hover:bg-emerald/15" title="Add a line for every colour of this design">+ all {vs.length} colours</button>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : openIdx === i && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
                    {suggest(l.supplierSku).map((p) => (
                      <button key={p.id} onClick={() => { set(i, { mappedProductId: p.id, mappedName: `${p.name} (${p.sku})`, variantId: "" }); setOpenIdx(null); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-mist">{p.name} <span className="text-muted">· {p.sku}</span></button>
                    ))}
                    <button onClick={() => startNew(i)} className="w-full text-left px-3 py-2 text-sm text-emerald-dark hover:bg-gold/10 border-t border-sand">
                      <Icon g="✦" className="inline-block align-middle w-[1em] h-[1em]" /> Create new product{l.supplierSku.trim() ? <> “{l.supplierSku.trim()}”</> : null} — sell on the counter now
                    </button>
                  </div>
                )}
              </div>
              <input className={input + " col-span-2"} placeholder="Qty" inputMode="numeric" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
              <div className="col-span-3">
                <input className={input + " w-full"} placeholder="Unit cost ₹" inputMode="numeric" value={l.cost} onChange={(e) => set(i, { cost: e.target.value })} />
                {(() => {
                  const last = l.variantId ? lastCosts?.byVariant?.[l.variantId] : (l.mappedProductId ? lastCosts?.byProduct?.[l.mappedProductId] : undefined);
                  if (!last || l.isNew) return null;
                  const r = Math.round(last / 100);
                  return <button type="button" onClick={() => set(i, { cost: String(r) })} className="block text-[10px] text-emerald-dark mt-0.5 hover:underline" title="Use last purchase price">last ₹{r} · use</button>;
                })()}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2 pt-2 text-sm">
                <span className="sensitive">{formatPaise((Number(l.qty) || 0) * (Number(l.cost) || 0) * 100)}</span>
                <button type="button" onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))} title="Remove this line" className="text-muted hover:text-rose leading-none shrink-0"><Icon g="✕" className="inline-block align-middle w-[1em] h-[1em]" /></button>
              </div>
            </div>

            {/* New-product panel — everything optional except name, category & wholesale price. */}
            {l.isNew && (
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="text-[11px] text-muted">Product name *<input className={`${input} w-full mt-0.5`} value={l.newName ?? ""} onChange={(e) => set(i, { newName: e.target.value })} placeholder="e.g. AD Necklace Set" /></label>
                  <label className="text-[11px] text-muted">Category *
                    <select className={`${input} w-full mt-0.5`} value={l.newCategoryId ?? ""} onChange={(e) => set(i, { newCategoryId: e.target.value, newSubId: "" })}>
                      <option value="">Select…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-muted">Subcategory
                    <select className={`${input} w-full mt-0.5`} value={l.newSubId ?? ""} onChange={(e) => set(i, { newSubId: e.target.value })}>
                      <option value="">None</option>
                      {subsFor(l.newCategoryId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-muted">SKU (optional)<input className={`${input} w-full mt-0.5 font-mono`} value={l.newSku ?? ""} onChange={(e) => set(i, { newSku: e.target.value.toUpperCase() })} placeholder="Auto if blank" /></label>
                  <label className="text-[11px] text-muted">Wholesale price ₹ *<input className={`${input} w-full mt-0.5`} inputMode="numeric" value={l.newWholesale ?? ""} onChange={(e) => set(i, { newWholesale: e.target.value })} placeholder="sell-to-reseller ₹" /></label>
                  <label className="text-[11px] text-muted">Retail price ₹ (optional)<input className={`${input} w-full mt-0.5`} inputMode="numeric" value={l.newRetail ?? ""} onChange={(e) => set(i, { newRetail: e.target.value })} placeholder="blank = auto from formula" /></label>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <label className="text-[11px] text-muted">Photo (optional)
                    <input type="file" accept="image/*" onChange={(e) => set(i, { newImage: e.target.files?.[0] ?? null })} className="block mt-0.5 text-xs text-ink file:mr-2 file:rounded-full file:border-0 file:bg-emerald file:text-white file:px-3 file:py-1 file:text-xs file:cursor-pointer" />
                  </label>
                  <span className="text-[11px] text-muted">Saved as a <b>draft</b> — sellable on the counter at once; publish to the website later from Catalogue.</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => setLines((p) => [...p, { supplierSku: "", mappedProductId: "", mappedName: "", variantId: "", qty: "", cost: "" }])} className="text-sm text-emerald nav-link mt-3">+ Add line</button>

      <div className="mt-5 border-t border-sand pt-4">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="text-lg font-semibold text-ink">Total: <span className="sensitive">{formatPaise(total * 100)}</span></span>
          <span className="text-[11px] text-muted ml-auto">Split the payment across methods — anything left over stays on credit.</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {METHODS.map(([m, label]) => (
            <div key={m} className="rounded-xl border border-sand p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink">{label}</span>
                <button type="button" onClick={() => fillRemaining(m)} className="text-[10px] text-emerald-dark hover:underline" title="Pay the remaining balance with this method">fill remaining</button>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-sm text-muted">₹</span>
                <input value={pay[m]} onChange={(e) => setPay((s) => ({ ...s, [m]: e.target.value }))} inputMode="decimal" placeholder="0" className={`${input} w-full`} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <p className="text-[11px]">
            {over ? (
              <span className="text-rose">Paid {formatPaise(paidNow * 100)} exceeds the total — reduce a method.</span>
            ) : paidNow === 0 ? (
              <span className="text-gold-dark">Nothing paid now — the full {formatPaise(total * 100)} will be owed to this supplier (credit). Record payments later from the supplier page.</span>
            ) : credit > 0 ? (
              <span className="text-muted">Paid {formatPaise(paidNow * 100)} now · <b className="text-gold-dark">{formatPaise(credit * 100)} on credit</b></span>
            ) : (
              <span className="text-emerald-dark">Paid in full <Icon g="✓" className="inline-block align-middle w-[1em] h-[1em]" /></span>
            )}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {confirmDup && (
              <button onClick={() => submit(true)} disabled={busy || over} className="px-4 py-2.5 rounded-xl border border-rose text-rose text-sm font-medium hover:bg-rose/10 disabled:opacity-50">Record anyway</button>
            )}
            <button onClick={() => submit(false)} disabled={busy || over} className="btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "Recording…" : "Record purchase"}</button>
          </div>
        </div>
      </div>
      {msg && <p className={`text-sm mt-2 ${confirmDup ? "text-rose" : "text-ink"}`}>{msg}</p>}
    </div>
  );
}
