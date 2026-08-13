"use client";
import { Icon } from "@/components/ui/Icon";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "@/components/admin/QrCode";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";

type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number };

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
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [printBox, setPrintBox] = useState<Box | null>(null);
  const input = "rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

  async function create() {
    const n = Math.floor(Number(packQty) || 0);
    if (n < 1) { setMsg({ text: "Pack quantity must be at least 1.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await createBoxGroupAction({ sku, packQty: n, label: label.trim() || undefined });
    setBusy(false);
    if (r.ok) { setMsg({ text: `Box QR ${r.code} created.`, ok: true }); setLabel(""); setPackQty("6"); router.refresh(); }
    else setMsg({ text: r.error ?? "Could not create the box QR.", ok: false });
  }
  function print(box: Box) { setPrintBox(box); setTimeout(() => window.print(), 60); }

  return (
    <>
    <div className="bg-white rounded-2xl border border-sand p-5 shadow-card no-print">
      <h3 className="font-medium text-ink mb-1 flex items-center gap-1.5"><Icon g="📦" className="w-4 h-4" />Packaging (box QR)</h3>
      <p className="text-xs text-muted mb-3">If this design comes in a box (e.g. 6 pieces), make a box QR. Scanning it at the counter adds the whole pack at once; each piece is still tracked and sold individually.</p>

      {groups.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1.5 pr-3">Box</th><th className="py-1.5 pr-3 text-center">Pack</th><th className="py-1.5 pr-3 text-center">In stock</th><th className="py-1.5 pr-3">Code</th><th className="py-1.5 text-right">Action</th></tr></thead>
            <tbody>
              {groups.map((b) => (
                <tr key={b.id} className="border-t border-sand/60">
                  <td className="py-2 pr-3 text-ink">{b.label}</td>
                  <td className="py-2 pr-3 text-center">×{b.packQty}</td>
                  <td className={`py-2 pr-3 text-center ${b.stock < b.packQty ? "text-gold-dark" : "text-emerald-dark"}`}>{b.stock}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{b.code}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => print(b)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald text-white hover:bg-emerald-dark"><Icon g="🖶" className="inline-block align-middle w-[1em] h-[1em]" />Print QR</button>
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

      {/* Print-only — OUTSIDE the no-print card (a no-print ancestor is display:none in print → blank). */}
      {printBox && (
        <>
          <style dangerouslySetInnerHTML={{ __html: "@media print{body{visibility:hidden}.box-print-area{visibility:visible;position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}.box-print-area *{visibility:visible}}" }} />
          <div className="box-print-area hidden print:flex">
            <QrCode value={printBox.code} size={240} />
            <p className="font-semibold text-ink text-lg">{printBox.name} <span className="font-mono">{printBox.sku}</span></p>
            <p className="font-bold text-ink" style={{ fontSize: "22px" }}>BOX OF {printBox.packQty} PIECES</p>
            <p className="font-mono text-sm">{printBox.code}</p>
          </div>
        </>
      )}
    </>
  );
}
