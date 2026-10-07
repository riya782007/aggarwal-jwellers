"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/pricing";
import { editOrderItemsAction, resolveSellableSku } from "@/app/actions/billing";
import { planBillEdit, type BillEditLine } from "@/lib/billEdit";

type SavedLine = { itemId: string; sku: string; name: string; qty: number; rate: number };

/**
 * "Edit items" on a saved Final Estimate (cash bill): change quantity or rate, remove a line,
 * or scan/type a SKU to add one — without cancelling the bill. Live preview of the new total
 * and of the money to collect / hand back; the database applies stock + money atomically.
 */
export function EditBillItems({ orderId, lines: saved, extrasPaise, paidPaise, totalPaise, wholesale }: {
  orderId: string;
  lines: SavedLine[];
  extrasPaise: number;
  paidPaise: number;
  totalPaise: number;
  /** Bill was rung up at wholesale rates — new items default to the wholesale rate. */
  wholesale: boolean;
}) {
  const router = useRouter();
  const fresh = (): BillEditLine[] => saved.map((l) => ({ ...l, origQty: l.qty, origRate: l.rate }));
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<BillEditLine[]>(fresh);
  const [sku, setSku] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState("");
  const [oversell, setOversell] = useState(false);
  const [stockShort, setStockShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const skuRef = useRef<HTMLInputElement>(null);

  const plan = useMemo(() => planBillEdit(lines, extrasPaise, paidPaise, totalPaise), [lines, extrasPaise, paidPaise, totalPaise]);
  const set = (i: number, patch: Partial<BillEditLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function addItem() {
    const code = sku.trim();
    const q = Math.max(1, Math.floor(Number(addQty) || 1));
    if (!code) return;
    setErr(""); setAdding(true);
    try {
      const r = await resolveSellableSku(code);
      if (!r.item) { setErr(r.error || `No item found for "${code}".`); return; }
      const item = r.item;
      const at = lines.findIndex((l) => l.sku.toUpperCase() === item.sku.toUpperCase());
      if (at >= 0) {
        // Already on the bill → just raise its quantity (and un-remove it).
        set(at, { qty: (lines[at].removed ? 0 : lines[at].qty) + q, removed: false });
      } else {
        const rate = wholesale && item.wholesale > 0 ? item.wholesale : item.price;
        setLines((ls) => [...ls, { sku: item.sku, name: item.name, qty: q, rate }]);
      }
      setSku(""); setAddQty("1");
    } catch {
      setErr("Couldn't look that item up — check the connection and try again.");
    } finally {
      setAdding(false);
      skuRef.current?.focus();
    }
  }

  async function save() {
    if (plan.problem) { setErr(plan.problem); return; }
    const money = plan.refund > 0
      ? `\n\nHand back ${formatPaise(plan.refund)} to the customer — it will be recorded as a refund.`
      : plan.due > 0 ? `\n\nThe customer will owe ${formatPaise(plan.due)}.` : "";
    if (!window.confirm(`Save changes to this bill?\nNew total: ${formatPaise(plan.newTotal)} (was ${formatPaise(totalPaise)}).${money}`)) return;
    setBusy(true); setErr(""); setStockShort(false);
    const res = await editOrderItemsAction({ orderId, lines: plan.payload, reason, allowOversell: oversell });
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Couldn't save the changes."); setStockShort(!!res.stockShort); return; }
    setDone(
      (res.refund ?? 0) > 0 ? `Bill updated. Hand back ${formatPaise(res.refund!)} to the customer (recorded as a refund).`
        : (res.due ?? 0) > 0 ? `Bill updated. Collect ${formatPaise(res.due!)} — use “Record a payment” below.`
          : "Bill updated. Stock and totals are adjusted.",
    );
    setOpen(false); setReason(""); setOversell(false);
    router.refresh();
  }

  const cell = "rounded-lg border border-sand px-2 py-1.5 text-sm outline-none focus:border-emerald bg-white";
  if (!open) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-card sm:col-span-2">
        <h2 className="font-medium text-ink mb-1">Edit items</h2>
        <p className="text-xs text-muted mb-3">Add an item, remove one, or change quantity / rate on this Final Estimate — no need to cancel the whole bill. Stock, total and cash book update automatically.</p>
        {done && <p className="text-sm text-emerald-dark mb-3">{done}</p>}
        <button onClick={() => { setLines(fresh()); setErr(""); setDone(""); setOpen(true); }} className="btn-primary px-4 py-2 text-sm font-medium">Edit items</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-card sm:col-span-2 border border-emerald/30">
      <h2 className="font-medium text-ink mb-3">Edit items</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-sand">
              <th className="py-2 pr-2">Item</th><th className="py-2 px-2 w-24">Qty</th><th className="py-2 px-2 w-32">Rate (₹)</th><th className="py-2 px-2 text-right">Amount</th><th className="py-2 pl-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.itemId ?? `new-${l.sku}`} className={`border-b border-sand/60 ${l.removed ? "opacity-50" : ""}`}>
                <td className="py-2 pr-2">
                  <span className={l.removed ? "line-through" : ""}>{l.name}</span>
                  <span className="ml-1 font-mono text-[11px] text-muted">{l.sku}</span>
                  {!l.itemId && <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-dark">new</span>}
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={1} step={1} disabled={l.removed} value={l.qty} aria-label={`Quantity for ${l.sku}`}
                    onChange={(e) => set(i, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${cell} w-20`} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} step={1} disabled={l.removed} value={Math.round(l.rate) / 100} aria-label={`Rate for ${l.sku}`}
                    onChange={(e) => set(i, { rate: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })} className={`${cell} w-28`} />
                </td>
                <td className="py-2 px-2 text-right">{l.removed ? "—" : formatPaise(Math.round(l.rate) * l.qty)}</td>
                <td className="py-2 pl-2 text-right">
                  {l.removed
                    ? <button onClick={() => set(i, { removed: false })} className="text-xs text-emerald underline">Undo</button>
                    : <button onClick={() => (l.itemId ? set(i, { removed: true }) : setLines((ls) => ls.filter((_, j) => j !== i)))} className="text-xs text-rose hover:underline">Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input ref={skuRef} value={sku} onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
          placeholder="Scan or type SKU to add" aria-label="SKU to add" className={`${cell} flex-1 min-w-[180px]`} />
        <input type="number" min={1} step={1} value={addQty} onChange={(e) => setAddQty(e.target.value)} aria-label="Quantity to add" className={`${cell} w-20`} />
        <button onClick={() => void addItem()} disabled={adding || !sku.trim()} className="px-4 py-2 rounded-full bg-ink/5 text-ink text-sm hover:bg-ink/10 disabled:opacity-50">{adding ? "Finding…" : "+ Add"}</button>
      </div>

      <div className="mt-4 rounded-xl bg-cream/60 p-3 text-sm space-y-1">
        {extrasPaise !== 0 && <div className="flex justify-between text-muted"><span>Packing / courier / adjustment</span><span>{formatPaise(extrasPaise)}</span></div>}
        <div className="flex justify-between font-semibold text-ink"><span>New total</span><span>{formatPaise(plan.newTotal)} <span className="text-xs font-normal text-muted">(was {formatPaise(totalPaise)})</span></span></div>
        {plan.refund > 0 && <div className="flex justify-between text-gold-dark font-medium"><span>Hand back to customer</span><span>{formatPaise(plan.refund)}</span></div>}
        {plan.due > 0 && <div className="flex justify-between text-rose font-medium"><span>Customer will owe</span><span>{formatPaise(plan.due)}</span></div>}
      </div>

      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason (optional) — e.g. customer added one more set"
        className={`${cell} w-full mt-3`} />
      {stockShort && (
        <label className="flex items-center gap-2 text-xs text-ink mt-2">
          <input type="checkbox" checked={oversell} onChange={(e) => setOversell(e.target.checked)} />
          Bill anyway beyond available stock (backorder)
        </label>
      )}
      {(err || plan.problem) && <p className="text-sm text-rose mt-2">{err || plan.problem}</p>}

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => void save()} disabled={busy || !plan.changed || !!plan.problem} className="btn-primary px-5 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        <button onClick={() => { setOpen(false); setErr(""); setStockShort(false); setOversell(false); }} disabled={busy} className="px-4 py-2 rounded-full bg-ink/5 text-ink text-sm hover:bg-ink/10">Cancel</button>
      </div>
    </div>
  );
}
