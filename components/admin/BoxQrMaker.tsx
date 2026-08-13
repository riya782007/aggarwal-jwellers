"use client";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "@/components/admin/QrCode";
import { createBoxGroupAction, deleteBoxGroupAction } from "@/app/actions/groups";

type Pick = { sku: string; name: string; qty?: number };
type Box = { id: string; code: string; label: string; packQty: number; sku: string; name: string; stock: number };

/**
 * Box / group QR maker. Pick ONE piece SKU + how many sit in the box → creates a group and prints a
 * single QR sticker for the box. Scanning that QR at the POS adds all N pieces to the bill (stock-
 * aware). The pieces stay individually tracked — the box is only a scan shortcut over their stock.
 */
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function BoxQrMaker({ products, groups }: { products: Pick[]; groups: Box[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [packQty, setPackQty] = useState("6");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [printBox, setPrintBox] = useState<Box | null>(null);
  const [printCount, setPrintCount] = useState(1);
  const [counts, setCounts] = useState<Record<string, string>>({}); // per-box: how many stickers to print
  const qrHolderRef = useRef<HTMLDivElement>(null); // off-screen QR, captured for the print iframe
  // One box QR = one sticker per PHYSICAL box, so default the print count to boxes-in-stock
  // (e.g. 540 pieces ÷ 12 per box = 45 box stickers). The owner can override per print.
  const boxesInStock = (b: Box) => Math.max(1, Math.floor((b.stock || 0) / (b.packQty || 1)));

  // PRIVACY: encode ONLY the box code — no web link — so a phone scan reveals nothing. The billing
  // scanner reads the raw GRP-… code, which the POS resolves to the box. (POS also accepts old /g/ URLs.)
  const qrValue = (code: string) => code;
  const input = "w-full rounded-xl border border-sand px-3 py-2 text-sm bg-white outline-none focus:border-emerald";

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

  // Print ONE box label in an isolated iframe. The old on-page approach (position:fixed + visibility)
  // dropped the QR and repeated text across pages; an iframe renders just the label on a clean A4 sheet
  // so direct-print == Save-as-PDF. We render the QR off-screen (qrHolderRef) then copy its SVG in.
  function print(box: Box) {
    const n = Math.max(1, Math.floor(Number(counts[box.id] ?? boxesInStock(box)) || 1));
    setPrintCount(n); setPrintBox(box);
  }
  useEffect(() => {
    if (!printBox) return;
    const box = printBox, n = Math.max(1, printCount);
    const t = setTimeout(() => {
      const svg = qrHolderRef.current?.querySelector("svg")?.outerHTML ?? "";
      // One box QR = one sticker per physical box. Tile N identical stickers across the sheet.
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

      {/* Existing boxes — reprint or remove. Stock shown is the piece's LIVE stock. */}
      {groups.length > 0 && (
        <div className="mt-5 pt-4 border-t border-sand overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2 pr-3">Box</th><th className="py-2 pr-3">Piece</th><th className="py-2 pr-3 text-center">Pack</th><th className="py-2 pr-3 text-center">In stock</th><th className="py-2 pr-3">Code</th><th className="py-2 text-right">Action</th></tr>
            </thead>
            <tbody>
              {groups.map((b) => (
                <tr key={b.id} className="border-t border-sand/60">
                  <td className="py-2 pr-3 text-ink">{b.label}</td>
                  <td className="py-2 pr-3 text-ink">{b.name} <span className="font-mono text-muted text-xs">{b.sku}</span></td>
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
      {/* Off-screen QR — rendered here so print() can copy its SVG into the isolated print iframe. */}
      <div ref={qrHolderRef} aria-hidden style={{ position: "absolute", left: -99999, top: 0, width: 240 }}>
        {printBox && <QrCode value={qrValue(printBox.code)} size={240} />}
      </div>
    </div>
  );
}
