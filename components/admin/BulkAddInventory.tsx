"use client";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { bulkCreateProductsAction } from "@/app/actions/catalog";
import { compressImage } from "@/lib/image";

type Cat = { id: string; name: string };
type Sub = { id: string; name: string; categoryId: string };

type Row = {
  key: string;
  name: string; sku: string;
  wholesale: string; retail: string; mrp: string; qty: string;
  image: File | null; preview: string | null;
  status?: "ok" | "error"; error?: string; // set after a save attempt
};

const fileToB64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = rej; r.readAsDataURL(f);
});

const newRow = (seed: Partial<Row> = {}): Row => ({
  key: Math.random().toString(36).slice(2),
  name: "", sku: "", wholesale: "", retail: "", mrp: "", qty: "1", image: null, preview: null, ...seed,
});

/**
 * Bulk Add Inventory — enter the common fields once, then a row per product. On save it calls the
 * SAME product creator as the single form, once per row, so every row becomes its own individual
 * product (own SKU, image, price, stock, QR, page, history). Never one product with a big quantity.
 */
export function BulkAddInventory({ categories, subcategories = [], styles = [] }: { categories: Cat[]; subcategories?: Sub[]; styles?: Sub[] }) {
  const { toast } = useToast();
  const router = useRouter();
  // Common fields — applied to every row.
  const [catId, setCatId] = useState("");
  const [subId, setSubId] = useState("");
  const [styleId, setStyleId] = useState("");
  const [retailPublish, setRetailPublish] = useState(true);
  const [wholesalePublish, setWholesalePublish] = useState(true);
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{ created: number; failed: number } | null>(null);
  const [labelSkus, setLabelSkus] = useState<string[]>([]); // created SKUs → one-click print in the Label module

  const subsForCat = subcategories.filter((s) => s.categoryId === catId);
  const stylesForCat = styles.filter((s) => s.categoryId === catId);
  const input = "rounded-lg border border-sand px-2.5 py-1.5 text-sm bg-white outline-none focus:border-emerald";

  const set = (i: number, patch: Partial<Row>) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, ...patch, status: undefined, error: undefined } : r));
  const addRow = () => setRows((p) => [...p, newRow()]);
  const duplicateRow = (i: number) => setRows((p) => {
    const r = p[i];
    // Copy values but FORCE a fresh SKU (blank → auto-generated) so two products never share a code.
    const copy = newRow({ name: r.name, wholesale: r.wholesale, retail: r.retail, mrp: r.mrp, qty: r.qty, sku: "" });
    return [...p.slice(0, i + 1), copy, ...p.slice(i + 1)];
  });
  const removeRow = (i: number) => setRows((p) => {
    const r = p[i]; if (r.preview) URL.revokeObjectURL(r.preview);
    return p.length > 1 ? p.filter((_, idx) => idx !== i) : [newRow()];
  });
  const setImage = (i: number, file: File | null) => setRows((p) => p.map((r, idx) => {
    if (idx !== i) return r;
    if (r.preview) URL.revokeObjectURL(r.preview);
    return { ...r, image: file, preview: file ? URL.createObjectURL(file) : null, status: undefined, error: undefined };
  }));

  // ---- live validation ----
  const skuCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const s = r.sku.trim().toUpperCase(); if (s) m.set(s, (m.get(s) ?? 0) + 1); }
    return m;
  }, [rows]);
  const rowError = (r: Row): string | null => {
    if (!r.name.trim() && !r.wholesale.trim() && !r.sku.trim() && !r.image) return "empty"; // blank row → skipped, not an error
    if (!r.name.trim()) return "Name required";
    if (!(Number(r.wholesale) > 0)) return "Wholesale price required";
    const s = r.sku.trim().toUpperCase();
    if (s && (skuCounts.get(s) ?? 0) > 1) return "Duplicate SKU in this batch";
    return null;
  };
  const activeRows = rows.filter((r) => rowError(r) !== "empty");
  const readyCount = activeRows.filter((r) => rowError(r) === null).length;
  const errorCount = activeRows.filter((r) => { const e = rowError(r); return e && e !== "empty"; }).length;
  const canSave = !!catId && readyCount > 0 && errorCount === 0 && !busy;

  async function saveAll() {
    if (!catId) { toast("Pick a common category first.", "error"); return; }
    if (errorCount > 0) { toast("Fix the highlighted rows before saving.", "error"); return; }
    const toCreate = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowError(r) === null);
    if (!toCreate.length) { toast("Add at least one product row.", "error"); return; }
    setBusy(true); setSavedSummary(null);
    try {
      const payloadRows = [];
      for (const { r } of toCreate) {
        let rawImageBase64: string | undefined, rawImageMime: string | undefined;
        if (r.image) { const small = await compressImage(r.image); rawImageBase64 = await fileToB64(small); rawImageMime = small.type || "image/jpeg"; }
        payloadRows.push({
          name: r.name.trim(), manualSku: r.sku.trim() || undefined,
          wholesaleRupees: Number(r.wholesale), retailRupees: r.retail ? Number(r.retail) : null, mrpRupees: r.mrp ? Number(r.mrp) : null,
          qty: Math.max(0, Math.floor(Number(r.qty) || 0)) || 1, rawImageBase64, rawImageMime,
        });
      }
      const res = await bulkCreateProductsAction({
        common: { categoryId: catId, subcategoryId: subId || undefined, styleId: styleId || undefined, retailPublish, wholesalePublish, mode },
        rows: payloadRows,
      });
      setBusy(false);
      if (res.error && res.created === 0) { toast(res.error, "error"); return; }
      // Map results back to rows: drop the ones that succeeded, keep failures with their reason.
      const failedByIdx = new Map<number, string>();
      res.results.forEach((rr, k) => { if (!rr.ok) failedByIdx.set(k, rr.error ?? "Failed"); });
      const survivors: Row[] = [];
      toCreate.forEach(({ r }, k) => { if (failedByIdx.has(k)) survivors.push({ ...r, status: "error", error: failedByIdx.get(k) }); });
      const untouched = rows.filter((r) => rowError(r) === "empty");
      setRows(survivors.length || untouched.length ? [...survivors, ...untouched] : [newRow()]);
      setSavedSummary({ created: res.created, failed: res.results.length - res.created });
      // Auto-queue every created product for the Label module (same as single-add), so the owner can
      // print all the new stickers in one click without hunting for each SKU.
      const createdSkus = res.results.filter((rr) => rr.ok && rr.sku).map((rr) => rr.sku as string);
      setLabelSkus(createdSkus);
      toast(`${res.created} product${res.created === 1 ? "" : "s"} added${res.results.length - res.created ? ` · ${res.results.length - res.created} failed` : ""}`, res.created ? "success" : "error");
      router.refresh();
    } catch (e) {
      setBusy(false); toast(e instanceof Error ? e.message : "Something went wrong", "error");
    }
  }

  return (
    <div className="space-y-5">
      {/* After a save — one click to print stickers for every product just added. */}
      {labelSkus.length > 0 && (
        <div className="bg-emerald-mist border border-emerald/30 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-emerald-dark">Added {labelSkus.length} product{labelSkus.length === 1 ? "" : "s"}. Print their barcode stickers now?</p>
          <div className="flex items-center gap-2">
            <Link href={`/admin/barcodes?skus=${encodeURIComponent(labelSkus.join(","))}`} target="_blank" className="btn-primary px-5 py-2 text-sm font-medium"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print labels</Link>
            <button type="button" onClick={() => setLabelSkus([])} className="px-4 py-2 text-sm rounded-full border border-sand text-muted hover:text-ink">Dismiss</button>
          </div>
        </div>
      )}

      {/* Common fields */}
      <section className="bg-white rounded-2xl border border-emerald/30 p-5 shadow-card">
        <div className="flex items-center gap-2 mb-1"><Icon g="📦" className="w-4 h-4 text-emerald-dark" /><h2 className="text-base font-semibold text-ink">Common product information</h2></div>
        <p className="text-xs text-emerald-dark mb-4">These fields are applied to <b>every product</b> in the batch below.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-muted">Category <span className="text-rose">*</span>
            <select className={`${input} w-full mt-0.5`} value={catId} onChange={(e) => { setCatId(e.target.value); setSubId(""); setStyleId(""); }}>
              <option value="">Select…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Sub-category
            <select className={`${input} w-full mt-0.5`} value={subId} onChange={(e) => setSubId(e.target.value)} disabled={!catId}>
              <option value="">{catId ? "None" : "Pick category first"}</option>{subsForCat.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Collection
            <select className={`${input} w-full mt-0.5`} value={styleId} onChange={(e) => setStyleId(e.target.value)} disabled={!catId}>
              <option value="">{catId ? "None" : "Pick category first"}</option>{stylesForCat.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={retailPublish} onChange={(e) => setRetailPublish(e.target.checked)} className="accent-emerald" /> Sell retail</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={wholesalePublish} onChange={(e) => setWholesalePublish(e.target.checked)} className="accent-emerald" /> Sell wholesale</label>
          <span className="text-muted">·</span>
          <label className="flex items-center gap-1.5"><input type="radio" name="bulkmode" checked={mode === "draft"} onChange={() => setMode("draft")} className="accent-emerald" /> Save as draft</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="bulkmode" checked={mode === "publish"} onChange={() => setMode("publish")} className="accent-emerald" /> Publish live</label>
        </div>
      </section>

      {/* Rows */}
      <section className="bg-white rounded-2xl border border-sand p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Products <span className="text-xs text-muted font-normal">· one row = one product</span></h2>
          <span className="text-xs text-muted">Only the unique details per product — category etc. come from above.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-2 w-6"></th>
                <th className="py-2 pr-2">Product name *</th>
                <th className="py-2 pr-2">SKU</th>
                <th className="py-2 pr-2 text-center">Image</th>
                <th className="py-2 pr-2 text-right">Wholesale ₹ *</th>
                <th className="py-2 pr-2 text-right">Retail ₹</th>
                <th className="py-2 pr-2 text-right">MRP ₹</th>
                <th className="py-2 pr-2 text-right w-16">Qty</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const err = rowError(r);
                const bad = err && err !== "empty";
                return (
                  <tr key={r.key} className={`border-t border-sand/60 ${bad ? "bg-rose/5" : ""}`}>
                    <td className="py-2 pr-2 text-center">
                      {bad ? <span title={err!} className="text-rose"><Icon g="⚠" className="inline-block w-[1em] h-[1em]" /></span>
                        : err === "empty" ? <span className="text-muted/40 text-xs">·</span>
                        : <span className="text-emerald-dark"><Icon g="✓" className="inline-block w-[1em] h-[1em]" /></span>}
                    </td>
                    <td className="py-2 pr-2"><input className={`${input} w-full min-w-[150px]`} placeholder="e.g. Gold Kada 01" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                    <td className="py-2 pr-2"><input className={`${input} w-28 font-mono ${r.sku && (skuCounts.get(r.sku.trim().toUpperCase()) ?? 0) > 1 ? "!border-rose" : ""}`} placeholder="auto" value={r.sku} onChange={(e) => set(i, { sku: e.target.value.toUpperCase() })} /></td>
                    <td className="py-2 pr-2">
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) setImage(i, f); }}
                        className="w-14 h-14 mx-auto rounded-lg border border-dashed border-sand flex items-center justify-center relative overflow-hidden bg-cream/40">
                        {r.preview ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.preview} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setImage(i, null)} title="Remove" className="absolute top-0 right-0 bg-ink/70 text-white text-[10px] w-4 h-4 leading-4 text-center">×</button>
                          </>
                        ) : (
                          <label className="cursor-pointer text-[10px] text-muted text-center px-1">
                            <Icon g="⬆" className="inline-block w-3.5 h-3.5" /><br />drop / pick
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(i, e.target.files?.[0] ?? null)} />
                          </label>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right"><input className={`${input} w-24 text-right`} inputMode="decimal" placeholder="0" value={r.wholesale} onChange={(e) => set(i, { wholesale: e.target.value })} /></td>
                    <td className="py-2 pr-2 text-right"><input className={`${input} w-24 text-right`} inputMode="decimal" placeholder="auto" value={r.retail} onChange={(e) => set(i, { retail: e.target.value })} /></td>
                    <td className="py-2 pr-2 text-right"><input className={`${input} w-24 text-right`} inputMode="decimal" placeholder="—" value={r.mrp} onChange={(e) => set(i, { mrp: e.target.value })} /></td>
                    <td className="py-2 pr-2 text-right"><input className={`${input} w-14 text-right`} inputMode="numeric" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} /></td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => duplicateRow(i)} title="Duplicate (new SKU)" className="text-xs px-2 py-1 rounded-lg bg-cream text-ink hover:bg-sand/60">Duplicate</button>
                      <button type="button" onClick={() => removeRow(i)} title="Remove" className="text-xs px-2 py-1 rounded-lg text-muted hover:text-rose ml-1"><Icon g="✕" className="inline-block w-[1em] h-[1em]" /></button>
                    </td>
                  </tr>
                );
              })}
              {rows.some((r) => r.error) && rows.map((r, i) => r.error ? (
                <tr key={`e${r.key}`}><td /><td colSpan={8} className="pb-2 text-[11px] text-rose">Row {i + 1}: {r.error}</td></tr>
              ) : null)}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="text-sm text-emerald nav-link mt-3">+ Add product</button>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-3 bg-white rounded-2xl border border-sand p-4 shadow-luxe flex flex-wrap items-center gap-3">
        <span className="text-sm"><b className="text-emerald-dark">{readyCount}</b> product{readyCount === 1 ? "" : "s"} ready{errorCount > 0 && <> · <b className="text-rose">{errorCount}</b> with errors</>}</span>
        {savedSummary && <span className="text-xs text-muted">Last save: {savedSummary.created} added{savedSummary.failed ? `, ${savedSummary.failed} failed` : ""}.</span>}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/catalogue" className="text-sm text-muted hover:text-ink">View catalogue →</Link>
          <button onClick={saveAll} disabled={!canSave} className="btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : `Save ${readyCount} product${readyCount === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>
  );
}
