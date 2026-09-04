"use client";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";
import { makeLabelsPdf } from "@/lib/labelPdf";

type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number; price?: number; wholesale?: number };

/**
 * Packaging / box QR for an EXISTING product. Mark that this design comes in a box of N and generate
 * its box QR — scanning it at the POS adds the whole pack. Same mechanism as the auto-box created when
 * adding a new product; this lets the owner attach one to inventory that already exists.
 * The QR encodes only the internal code (no web link), so a phone scan reveals nothing.
 */
export function ProductBoxQr({ sku, name, groups }: { sku: string; name: string; groups: Box[] }) {
  const router = useRouter();
  const [packQty, setPackQty] = useState("6");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // One box QR = one sticker per physical box → default the count to boxes-in-stock.
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));
  const input = "rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";
  const visibleGroups = useMemo(
    () => groups.filter((b) => !hiddenIds.has(b.id)),
    [groups, hiddenIds],
  );

  async function create() {
    const n = Math.floor(Number(packQty) || 0);
    if (n < 1) { setMsg({ text: "Pack quantity must be at least 1.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await createBoxGroupAction({ sku, packQty: n, label: label.trim() || undefined });
    setBusy(false);
    if (r.ok) { setMsg({ text: `Box QR ${r.code} created.`, ok: true }); setLabel(""); setPackQty("6"); router.refresh(); }
    else setMsg({ text: r.error ?? "Could not create the box QR.", ok: false });
  }

  // Print then hide from this list only — POS keeps resolving the printed QR.
  async function print(box: Box) {
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    const labels = Array.from({ length: n }, () => ({
      name: box.name, sku: box.sku, qrValue: box.code,
      // The QR payload is the group code used by POS. Keep printed text compact so it never
      // competes with the QR's quiet zone on a 2in × 1in sticker.
      boxLine: `BOX OF ${box.packQty}`,
      showName: true, showSku: true,
    }));
    try {
      await makeLabelsPdf(labels, "print");
      setHiddenIds((prev) => new Set(prev).add(box.id));
      const r = await deleteBoxGroupAction(box.id);
      if (r.ok) {
        setMsg({ text: `Printed ${n} label${n === 1 ? "" : "s"}. Removed from list.`, ok: true });
        router.refresh();
      } else {
        setMsg({ text: `Printed, but could not clear: ${r.error ?? "unknown"}`, ok: false });
      }
    } catch (e: any) {
      alert(e?.message || "Couldn't generate the labels.");
    }
  }

  async function remove(box: Box) {
    if (!confirm(`Remove box QR "${box.label}" (${box.code}) from this list?\n\nPrinted stickers stay valid at POS.`)) return;
    setDeletingId(box.id);
    setMsg(null);
    setHiddenIds((prev) => new Set(prev).add(box.id));
    try {
      const r = await deleteBoxGroupAction(box.id);
      if (r.ok) {
        setMsg({ text: `Removed ${box.label}.`, ok: true });
        router.refresh();
      } else {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(box.id);
          return next;
        });
        setMsg({ text: r.error ?? "Delete failed.", ok: false });
      }
    } catch (e: any) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(box.id);
        return next;
      });
      setMsg({ text: e?.message || "Delete failed.", ok: false });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-sand p-5 shadow-card no-print">
      <h3 className="font-medium text-ink mb-1 flex items-center gap-1.5"><Icon g="📦" className="w-4 h-4" />Packaging (box QR)</h3>
      <p className="text-xs text-muted mb-3">If this design comes in a box (e.g. 6 pieces), make a box QR. Scanning it at the counter adds the whole pack at once; each piece is still tracked and sold individually.</p>

      {visibleGroups.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1.5 pr-3">Box</th><th className="py-1.5 pr-3 text-center">Pack</th><th className="py-1.5 pr-3 text-center">In stock</th><th className="py-1.5 pr-3">Code</th><th className="py-1.5 text-right">Action</th></tr></thead>
            <tbody>
              {visibleGroups.map((b) => (
                <tr key={b.id} className="border-t border-sand/60">
                  <td className="py-2 pr-3 text-ink">{b.label}</td>
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

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted">Pieces in the box
          <input className={`${input} w-24 block mt-0.5`} inputMode="numeric" value={packQty} onChange={(e) => setPackQty(e.target.value)} placeholder="6" />
        </label>
        <label className="text-[11px] text-muted flex-1 min-w-[160px]">Box label (optional)
          <input className={`${input} w-full block mt-0.5`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${name} · box`} />
        </label>
        <button onClick={create} disabled={busy} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Creating…" : "Create box QR"}</button>
      </div>
      {msg && <p className={`text-xs mt-2 ${msg.ok ? "text-emerald-dark" : "text-rose"}`}>{msg.text}</p>}
    </div>
  );
}
