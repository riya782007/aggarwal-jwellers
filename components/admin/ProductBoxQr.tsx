"use client";
import { Icon } from "@/components/ui/Icon";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "@/components/admin/QrCode";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";

type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number };
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

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
  const [printCount, setPrintCount] = useState(1);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const qrHolderRef = useRef<HTMLDivElement>(null);
  // One box QR = one sticker per physical box → default the count to boxes-in-stock.
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));
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
  // Print one box label in an isolated iframe (see BoxQrMaker for why: avoids fixed/visibility print bugs).
  function print(box: Box) {
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    setPrintCount(n); setPrintBox(box);
  }
  useEffect(() => {
    if (!printBox) return;
    const box = printBox, n = Math.max(1, printCount);
    const t = setTimeout(() => {
      const svg = qrHolderRef.current?.querySelector("svg")?.outerHTML ?? "";
      const tile = `<div class="tile">${svg}<div class="name">${esc(box.name)}</div><div class="count">BOX OF ${box.packQty} · ${esc(box.sku)}</div><div class="code">${esc(box.code)}</div></div>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(box.code)} ×${n}</title><style>
        @page{size:A4;margin:8mm} *{box-sizing:border-box} html,body{margin:0;padding:0}
        .sheet{display:flex;flex-wrap:wrap;gap:4mm}
        .tile{width:56mm;border:1px solid #bbb;border-radius:3px;padding:2.5mm;display:flex;flex-direction:column;align-items:center;text-align:center;page-break-inside:avoid;color:#111;font-family:system-ui,Arial,sans-serif}
        .tile svg{width:32mm !important;height:32mm !important}
        .tile .name{font-size:8pt;font-weight:600;line-height:1.1;margin-top:1mm}
        .tile .count{font-size:8pt;font-weight:800;margin-top:.5mm}
        .tile .code{font-family:ui-monospace,monospace;font-size:7.5pt}
      </style></head><body><div class="sheet">${Array.from({ length: n }, () => tile).join("")}</div></body></html>`;
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow!.document; doc.open(); doc.write(html); doc.close();
      const go = () => { try { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); } finally { setTimeout(() => iframe.remove(), 1500); } };
      if (doc.readyState === "complete") go(); else iframe.onload = go;
      setPrintBox(null);
    }, 80);
    return () => clearTimeout(t);
  }, [printBox, printCount]);

  return (
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
      {/* Off-screen QR — captured into the print iframe by print(). */}
      <div ref={qrHolderRef} aria-hidden style={{ position: "absolute", left: -99999, top: 0, width: 240 }}>
        {printBox && <QrCode value={printBox.code} size={240} />}
      </div>
    </div>
  );
}
