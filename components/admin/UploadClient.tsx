"use client";
import { useState } from "react";
import { createProductAction, bulkUploadAction, type RowResult } from "@/app/actions/catalog";

type Cat = { id: string; name: string };

export function UploadClient({ categories }: { categories: Cat[] }) {
  const [catId, setCatId] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [results, setResults] = useState<RowResult[]>([]);
  const [form, setForm] = useState({ name: "", price: "", qty: "", type: "simple" as "simple" | "configurable", colors: "" });
  const [csv, setCsv] = useState("");

  const input = "w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald transition-colors";
  const catName = categories.find((c) => c.id === catId)?.name;

  async function addSingle() {
    setBusy(true); setMsg(""); setResults([]);
    const res = await createProductAction({
      categoryId: catId, name: form.name.trim(), basePriceRupees: Number(form.price),
      qty: Number(form.qty) || 0, type: form.type, colors: form.colors.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setBusy(false);
    if (res.ok) { setMsg(`✓ Added ${res.sku} to ${catName}`); setForm({ name: "", price: "", qty: "", type: "simple", colors: "" }); }
    else setMsg(`✕ ${res.error}`);
  }

  async function addBulk() {
    setBusy(true); setMsg(""); setResults([]);
    const rows = csv.split("\n").map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^name\s*,/i.test(l))
      .map((l) => {
        const [name, price, qty, type, colors] = l.split(",").map((s) => s?.trim() ?? "");
        return { name, basePriceRupees: Number(price), qty: Number(qty) || 0, type: (type === "configurable" ? "configurable" : "simple") as "simple" | "configurable", colors: (colors ?? "").split("|").map((s) => s.trim()).filter(Boolean) };
      });
    const res = await bulkUploadAction(catId, rows);
    setBusy(false);
    setResults(res.results);
    setMsg(`${res.created} of ${rows.length} rows imported into ${catName}`);
  }

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-2xl p-6 shadow-card mb-5">
        <label className="text-sm font-medium text-ink">Step 1 · Choose a category <span className="text-rose">*</span></label>
        <p className="text-xs text-muted mb-2">Everything you upload goes under this category — no misclassification.</p>
        <select value={catId} onChange={(e) => setCatId(e.target.value)} className={input}>
          <option value="">Select a category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className={`bg-white rounded-2xl p-6 shadow-card transition-opacity ${catId ? "" : "opacity-40 pointer-events-none"}`}>
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-medium text-ink">Step 2 · Add designs</label>
          <div className="flex gap-1 bg-cream rounded-full p-1">
            {(["single", "bulk"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded-full text-xs ${mode === m ? "bg-ink text-white" : "text-muted"}`}>{m === "single" ? "Single" : "Bulk CSV"}</button>
            ))}
          </div>
        </div>

        {mode === "single" ? (
          <div className="space-y-3">
            <input className={input} placeholder="Design name (e.g. Rajwadi Kundan Necklace)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={input} placeholder="Base wholesale ₹" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <input className={input} placeholder="Stock qty" inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="simple">Simple (one item)</option>
                <option value="configurable">Configurable (colours)</option>
              </select>
              <input className={input} placeholder="Colours, comma separated" value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} disabled={form.type !== "configurable"} />
            </div>
            <button onClick={addSingle} disabled={busy} className="btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-60">{busy ? "Adding…" : "Add design"}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">Format per line: <code className="bg-cream px-1 rounded">name, base_price, qty, type, colours|pipe|separated</code></p>
            <textarea className={`${input} font-mono text-xs`} rows={6} placeholder={"Kundan Choker, 850, 12, configurable, Red|Green|Blue\nPearl Studs, 160, 40, simple,"} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <button onClick={addBulk} disabled={busy} className="btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-60">{busy ? "Importing…" : "Import CSV"}</button>
          </div>
        )}

        {msg && <p className="text-sm mt-3 text-ink">{msg}</p>}
        {results.length > 0 && (
          <div className="mt-3 max-h-44 overflow-y-auto text-xs space-y-1">
            {results.map((r) => (
              <div key={r.row} className={r.ok ? "text-emerald-dark" : "text-rose"}>
                Row {r.row}: {r.ok ? `✓ added ${r.sku}` : `✕ ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
