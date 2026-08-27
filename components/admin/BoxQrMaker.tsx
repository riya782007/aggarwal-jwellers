"use client";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";
import { makeLabelsPdf } from "@/lib/labelPdf";
import { labelsForBox, labelsForBoxes } from "@/lib/boxLabelPrint";

type Pick = { sku: string; name: string; qty?: number };
type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number; price?: number; wholesale?: number };

/**
 * Box / group QR maker. Pick ONE piece SKU + how many sit in the box → creates a group and prints box
 * QR stickers on the SAME thermal label roll as piece labels. Scanning a box QR at the POS adds all N
 * pieces to the bill (stock-aware). The pieces stay individually tracked — the box is only a shortcut.
 */
export function BoxQrMaker({ products, groups }: { products: Pick[]; groups: Box[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [packQty, setPackQty] = useState("6");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));
  const input = "w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

  const visibleGroups = useMemo(
    () => groups.filter((b) => !hiddenIds.has(b.id)),
    [groups, hiddenIds],
  );

  const matches = useMemo(
    () => (q.trim() ? products.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []),
    [q, products],
  );

  async function create() {
    if (!sku) { setMsg({ text: "Pick a product/variant SKU first.", ok: false }); return; }
    const n = Math.floor(Number(packQty) || 0);
    if (n < 1) { setMsg({ text: "Pack quantity must be at least 1.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await createBoxGroupAction({ sku, packQty: n, label: label.trim() || undefined });
    setBusy(false);
    if (r.ok) { setMsg({ text: `Box QR ${r.code} created. Print it from the list below.`, ok: true }); setSku(""); setName(""); setLabel(""); setPackQty("6"); setQ(""); router.refresh(); }
    else setMsg({ text: r.error ?? "Could not create the box QR.", ok: false });
  }

  // After print: hide from this list only. QR stays active so POS still scans printed stickers.
  async function print(box: Box) {
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    const labels = labelsForBox(box, n);
    try {
      await makeLabelsPdf(labels, "print");
      setHiddenIds((prev) => new Set(prev).add(box.id));
      setMsg({ text: `Printed ${n} label${n === 1 ? "" : "s"} for ${box.label}. Removing from list…`, ok: true });
      const r = await deleteBoxGroupAction(box.id);
      if (r.ok) {
        setMsg({ text: `Printed ${n} label${n === 1 ? "" : "s"} for ${box.label}. Removed from this list.`, ok: true });
        router.refresh();
      } else {
        setMsg({ text: `Printed, but could not clear from list: ${r.error ?? "unknown error"}`, ok: false });
      }
    } catch (e: any) {
      alert(e?.message || "Couldn't generate the labels.");
    }
  }

  async function printAll() {
    const labels = labelsForBoxes(visibleGroups, counts, boxesInStock);
    if (labels.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      await makeLabelsPdf(labels, "print");
      setMsg({ text: `Opened ${labels.length} box label${labels.length === 1 ? "" : "s"} for printing.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message || "Couldn't generate the labels.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function remove(box: Box) {
    if (!confirm(`Remove box QR "${box.label}" (${box.code}) from this list?\n\nPrinted stickers stay valid at POS — this only clears the row here.`)) return;
    setDeletingId(box.id);
    setMsg(null);
    setHiddenIds((prev) => new Set(prev).add(box.id));
    try {
      const r = await deleteBoxGroupAction(box.id);
      if (r.ok) {
        setMsg({ text: `Removed ${box.label}.`, ok: true });
        router.refresh();
      } else {
        setHiddenIds((prev) => { const next = new Set(prev); next.delete(box.id); return next; });
        setMsg({ text: r.error ?? "Delete failed.", ok: false });
      }
    } catch (e: any) {
      setHiddenIds((prev) => { const next = new Set(prev); next.delete(box.id); return next; });
      setMsg({ text: e?.message || "Delete failed.", ok: false });
    } finally {
      setDeletingId(null);
    }
  }

  async function removeAll() {
    if (visibleGroups.length === 0) return;
    if (!confirm(`Remove all ${visibleGroups.length} box QR(s) from this list?\n\nPrinted stickers stay valid at POS.`)) return;
    setBusy(true); setMsg(null);
    const snapshot = [...visibleGroups];
    setHiddenIds((prev) => {
      const next = new Set(prev);
      snapshot.forEach((b) => next.add(b.id));
      return next;
    });
    let failed = 0;
    for (const b of snapshot) {
      const r = await deleteBoxGroupAction(b.id);
      if (!r.ok) {
        failed++;
        setHiddenIds((prev) => { const next = new Set(prev); next.delete(b.id); return next; });
      }
    }
    setBusy(false);
    router.refresh();
    setMsg({
      text: failed ? `Removed most boxes; ${failed} failed.` : `Removed all ${snapshot.length} box QR(s).`,
      ok: failed === 0,
    });
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-card mb-5 no-print">
      <h2 className="font-medium text-ink mb-1 flex items-center gap-1.5"><Icon g="📦" className="w-4 h-4" />Box / group QR</h2>
      <p className="text-xs text-muted mb-4">One QR for a box of identical pieces. Scanning it at the counter adds the whole pack (e.g. 6 bangles) to the bill at once — each piece is still tracked and sold individually, so selling some leaves the rest sellable and the box just adds however many are in stock.</p>

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <label className="text-[11px] text-muted">Piece (product / variant) *</label>
          <input className={`${input} mt-0.5`} placeholder="Search name / SKU…" value={sku ? `${name} · ${sku}` : q}
            onChange={(e) => { setQ(e.target.value); setSku(""); setName(""); }} onFocus={() => { if (sku) { setSku(""); setName(""); setQ(""); } }} />
          {!sku && matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-luxe border border-sand overflow-hidden">
              {matches.map((p) => (
                <button key={p.sku} type="button" onClick={() => { setSku(p.sku); setName(p.name); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-mist">
                  {p.name} <span className="text-muted">· {p.sku}</span>{typeof p.qty === "number" && <span className="text-[10px] text-muted"> · {p.qty} in stock</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-muted">Pieces in the box *</label>
          <input className={`${input} mt-0.5`} inputMode="numeric" value={packQty} onChange={(e) => setPackQty(e.target.value)} placeholder="6" />
        </div>
        <div>
          <label className="text-[11px] text-muted">Box label (optional)</label>
          <input className={`${input} mt-0.5`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="auto" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={create} disabled={busy} className="btn-primary px-5 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Creating…" : "Create box QR"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-dark" : "text-rose"}`}>{msg.text}</span>}
      </div>

      {visibleGroups.length > 0 && (
        <div className="mt-5 pt-4 border-t border-sand overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted">{visibleGroups.length} box QR{visibleGroups.length === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={printAll} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark disabled:opacity-50">
                <Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print all
              </button>
              <button type="button" onClick={removeAll} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-rose/10 text-rose hover:bg-rose/20 disabled:opacity-50">
                Clear all from list
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2 pr-3">Box</th><th className="py-2 pr-3">Piece</th><th className="py-2 pr-3 text-center">Pack</th><th className="py-2 pr-3 text-center">In stock</th><th className="py-2 pr-3">Code</th><th className="py-2 text-right">Action</th></tr>
            </thead>
            <tbody>
              {visibleGroups.map((b) => (
                <tr key={b.id} className="border-t border-sand/60">
                  <td className="py-2 pr-3 text-ink">{b.label}</td>
                  <td className="py-2 pr-3 text-ink">{b.name} <span className="font-mono text-muted text-xs">{b.sku}</span></td>
                  <td className="py-2 pr-3 text-center">×{b.packQty}</td>
                  <td className={`py-2 pr-3 text-center ${b.stock < b.packQty ? "text-gold-dark" : "text-emerald-dark"}`}>{b.stock}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{b.code}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <label className="text-[10px] text-muted mr-1">Labels<input value={counts[b.id] ?? String(boxesInStock(b))} onChange={(e) => setCounts((c) => ({ ...c, [b.id]: e.target.value }))} inputMode="numeric" title="Stickers to print (default = boxes in stock)" className="w-14 text-center rounded-lg border border-sand px-2 py-1 text-xs ml-1" /></label>
                    <button type="button" onClick={() => print(b)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark ml-1"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print</button>
                    <button type="button" onClick={() => remove(b)} disabled={deletingId === b.id} className="text-xs px-2 py-1.5 rounded-lg bg-rose/10 text-rose hover:bg-rose/20 ml-2 disabled:opacity-50">
                      {deletingId === b.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
