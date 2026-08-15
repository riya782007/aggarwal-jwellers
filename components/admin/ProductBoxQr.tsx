"use client";
import { Icon } from "@/components/ui/Icon";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";
import { makeLabelsPdf } from "@/lib/labelPdf";
import { boxPdfLabel } from "@/lib/boxQr";

type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number; price?: number; wholesale?: number };

/**
 * Packaging / box QR for an EXISTING product. Mark that this design comes in a box of N and generate
 * its box QR — scanning it at the POS adds the whole pack. The QR encodes the piece SKU + pack count
 * (BOX:AJ1004:5). Reprinting an old GRP sticker uses the same piece SKU on the new label.
 */
export function ProductBoxQr({ sku, name, groups }: { sku: string; name: string; groups: Box[] }) {
  const router = useRouter();
  const [packQty, setPackQty] = useState("6");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  // One box QR = one sticker per physical box → default the count to boxes-in-stock.
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));
  const input = "rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

  async function create() {
    const n = Math.floor(Number(packQty) || 0);
    if (n < 1) { setMsg({ text: "Pack quantity must be at least 1.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await createBoxGroupAction({ sku, packQty: n, label: label.trim() || undefined });
    setBusy(false);
    if (r.ok) { setMsg({ text: `Box QR for ${sku} ×${n} created.`, ok: true }); setLabel(""); setPackQty("6"); router.refresh(); }
    else setMsg({ text: r.error ?? "Could not create the box QR.", ok: false });
  }
  // Print box stickers on the SAME thermal label roll as piece labels, via the shared makeLabelsPdf.
  // One box QR = one sticker per physical box → default count to boxes-in-stock (editable per row).
  async function print(box: Box) {
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    const one = boxPdfLabel(box);
    const labels = Array.from({ length: n }, () => ({ ...one }));
    await makeLabelsPdf(labels, "print").catch((e: any) => alert(e?.message || "Couldn't generate the labels."));
  }

  return (
    <div className="bg-white rounded-2xl border border-sand p-5 shadow-card no-print">
      <h3 className="font-medium text-ink mb-1 flex items-center gap-1.5"><Icon g="📦" className="w-4 h-4" />Packaging (box QR)</h3>
      <p className="text-xs text-muted mb-3">If this design comes in a box (e.g. 5 pieces), make a box QR. Scanning it at the counter adds the whole pack under this product&apos;s SKU. The sticker shows that SKU, pack size, and the same price numbers as a piece label.</p>

      {groups.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1.5 pr-3">Box</th><th className="py-1.5 pr-3 text-center">Pack</th><th className="py-1.5 pr-3 text-center">In stock</th><th className="py-1.5 pr-3">SKU</th><th className="py-1.5 text-right">Action</th></tr></thead>
            <tbody>
              {groups.map((b) => (
                <tr key={b.id} className="border-t border-sand/60">
                  <td className="py-2 pr-3 text-ink">{b.label}</td>
                  <td className="py-2 pr-3 text-center">×{b.packQty}</td>
                  <td className={`py-2 pr-3 text-center ${b.stock < b.packQty ? "text-gold-dark" : "text-emerald-dark"}`}>{b.stock}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{b.sku}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <label className="text-[10px] text-muted mr-1">Labels<input value={counts[b.id] ?? String(boxesInStock(b))} onChange={(e) => setCounts((c) => ({ ...c, [b.id]: e.target.value }))} inputMode="numeric" title="Stickers to print (default = boxes in stock)" className="w-14 text-center rounded-lg border border-sand px-2 py-1 text-xs ml-1" /></label>
                    <button onClick={() => print(b)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark ml-1"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print</button>
                    <form action={deleteBoxGroupAction} className="inline-block ml-2"><input type="hidden" name="id" value={b.id} /><button className="text-xs px-2 py-1.5 rounded-lg bg-rose/10 text-rose hover:bg-rose/20">Delete</button></form>
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
