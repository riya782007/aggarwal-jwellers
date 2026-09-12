"use client";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBoxGroupAction, deleteBoxGroupAction, hideBoxGroupsAction, restoreHiddenBoxQrsAction } from "@/app/actions/groups";
import { makeLabelsPdf, preloadJsPdf } from "@/lib/labelPdf";
import { formatBoxLabelLine } from "@/lib/boxLabel";
import { priceCodeFromPaise } from "@/lib/priceCode";

type Pick = { sku: string; name: string; qty?: number };
type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number; price?: number; wholesale?: number; hidden?: boolean };

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
  const [showHidden, setShowHidden] = useState(false);
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));
  const input = "w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

  useEffect(() => { preloadJsPdf(); }, []);

  // `hidden` comes from the DB (rows cleared with Delete, or buried by migration 0078).
  // `hiddenIds` is the optimistic client-side hide while a Delete is in flight.
  const visibleGroups = useMemo(
    () => groups.filter((b) => !b.hidden && !hiddenIds.has(b.id)),
    [groups, hiddenIds],
  );
  const hiddenGroups = useMemo(() => groups.filter((b) => b.hidden), [groups]);

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

  /** Same coded price scheme as piece labels: A + 7{wholesale}7 + {retail} + 51 (lib/priceCode). */
  const priceCode = (box: Box) => priceCodeFromPaise(box.wholesale, box.price);

  /** Build the sticker payload for one box row — shared by Print and Print all. */
  function labelsFor(box: Box, n: number) {
    const code = priceCode(box);
    return Array.from({ length: n }, () => ({
      name: box.name, sku: box.sku, qrValue: box.code,
      priceLine: code || undefined,
      // Piece SKU is the visible SKU. Group code is printed once (it already starts with GRP-).
      // QR payload stays the group code so POS pack-scan is unchanged.
      boxLine: formatBoxLabelLine(box.code, box.packQty),
      showName: true, showSku: true,
    }));
  }

  // Printing PRINTS — it no longer removes the row. It used to call deleteBoxGroupAction straight
  // after the PDF opened, so one Print (or a mis-click on Print all) hid the box for good with no
  // way back, and the labels list emptied itself. Use Delete to clear a row deliberately.
  async function print(box: Box) {
    if (busy) return;
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    setBusy(true);
    try {
      await makeLabelsPdf(labelsFor(box, n), "print");
      setMsg({ text: `Printed ${n} label${n === 1 ? "" : "s"} for ${box.label}. The box stays in this list — reprint any time.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message || "Couldn't generate the labels.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  /** Print every listed box QR in one PDF, respecting each row's label count. Rows stay listed. */
  async function printAll() {
    const snapshot = [...visibleGroups];
    if (snapshot.length === 0) return;
    setBusy(true); setMsg(null);
    const labels = snapshot.flatMap((box) =>
      labelsFor(box, Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1))),
    );
    try {
      await makeLabelsPdf(labels, "print");
      setMsg({ text: `Printed ${labels.length} label${labels.length === 1 ? "" : "s"} across ${snapshot.length} box${snapshot.length === 1 ? "" : "es"}. All boxes stay in this list.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message || "Couldn't generate the labels.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  /** Put a hidden box QR (or all of them) back on the list. */
  async function restore(box?: Box) {
    setBusy(true); setMsg(null);
    try {
      const r = await restoreHiddenBoxQrsAction(box?.id);
      if (r.ok) {
        setMsg({ text: box ? `${box.label} is back on the list.` : `Restored ${r.restored} hidden box QR${r.restored === 1 ? "" : "s"}.`, ok: true });
        setShowHidden(false);
        router.refresh();
      } else {
        setMsg({ text: r.error ?? "Could not restore the box QR.", ok: false });
      }
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not restore the box QR.", ok: false });
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
    const snapshot = [...visibleGroups];
    setBusy(true); setMsg(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      snapshot.forEach((b) => next.add(b.id));
      return next;
    });
    try {
      const r = await hideBoxGroupsAction(snapshot.map((b) => b.id));
      if (r.ok) {
        setMsg({
          text: `Removed ${r.hidden} box QR${r.hidden === 1 ? "" : "s"} from this list.`,
          ok: true,
        });
        router.refresh();
      } else {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          snapshot.forEach((b) => next.delete(b.id));
          return next;
        });
        setMsg({ text: r.error ?? "Could not clear the list.", ok: false });
      }
    } catch (e: any) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        snapshot.forEach((b) => next.delete(b.id));
        return next;
      });
      setMsg({ text: e?.message || "Could not clear the list.", ok: false });
    } finally {
      setBusy(false);
    }
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
        <button onClick={create} disabled={busy} className="btn-primary px-5 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Working…" : "Create box QR"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-dark" : "text-rose"}`}>{msg.text}</span>}
      </div>

      {hiddenGroups.length > 0 && (
        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink">
              <b>{hiddenGroups.length}</b> box QR{hiddenGroups.length === 1 ? " is" : "s are"} hidden from this list. Their printed stickers still scan at the counter.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border border-sand bg-white hover:bg-cream/60">
                {showHidden ? "Hide" : "Show"} hidden
              </button>
              <button type="button" onClick={() => restore()} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark disabled:opacity-50">
                Restore all
              </button>
            </div>
          </div>
          {showHidden && (
            <ul className="mt-2 pt-2 border-t border-gold/30 space-y-1">
              {hiddenGroups.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink truncate">{b.label} <span className="font-mono text-muted">{b.code}</span> · ×{b.packQty}</span>
                  <button type="button" onClick={() => restore(b)} disabled={busy} className="shrink-0 px-2.5 py-1 rounded-lg border border-emerald text-emerald hover:bg-emerald/10 disabled:opacity-50">
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                    <label className="text-[10px] text-muted mr-1">Labels<input disabled={busy} value={counts[b.id] ?? String(boxesInStock(b))} onChange={(e) => setCounts((c) => ({ ...c, [b.id]: e.target.value }))} inputMode="numeric" title="Stickers to print (default = boxes in stock)" className="w-14 text-center rounded-lg border border-sand px-2 py-1 text-xs ml-1" /></label>
                    <button type="button" onClick={() => print(b)} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark ml-1 disabled:opacity-50"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />{busy ? "Preparing…" : "Print"}</button>
                    <button type="button" onClick={() => remove(b)} disabled={busy || deletingId === b.id} className="text-xs px-2 py-1.5 rounded-lg bg-rose/10 text-rose hover:bg-rose/20 ml-2 disabled:opacity-50">
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
