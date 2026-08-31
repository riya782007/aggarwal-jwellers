"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkRemoveStockAction } from "@/app/actions/stock";
import { useToast } from "@/components/ui/Toast";

type Item = { sku: string; name: string; qty: number; cls: string; hasVariants: boolean };

/** Owner-confirmed physical stock cleanup. It zeroes on-hand stock, never deletes catalogue rows. */
export function BulkInventoryCleanup({ items }: { items: Item[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligible = items.filter((item) => item.qty > 0 && !item.hasVariants);
  const allSelected = eligible.length > 0 && eligible.every((item) => selected.includes(item.sku));
  const selectedItems = eligible.filter((item) => selected.includes(item.sku));
  const selectedQty = selectedItems.reduce((sum, item) => sum + item.qty, 0);

  function toggle(sku: string) { setSelected((prev) => prev.includes(sku) ? prev.filter((x) => x !== sku) : [...prev, sku]); }
  function toggleAll() { setSelected(allSelected ? [] : eligible.map((item) => item.sku)); }
  async function remove() {
    setBusy(true);
    try {
      const result = await bulkRemoveStockAction({ skus: selected, reason });
      if (!result.ok) return toast(result.error ?? "Stock cleanup failed.", "error");
      setOpen(false); setSelected([]); setReason("");
      toast(`Removed ${result.removed} pcs from ${result.products} product${result.products === 1 ? "" : "s"}.${result.skipped ? ` ${result.skipped} skipped because stock changed.` : ""}`);
      router.refresh();
    } catch {
      toast("Stock cleanup failed. Refresh and review the stock ledger.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 bg-white rounded-2xl p-4 shadow-card border border-sand">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-medium text-ink">Bulk physical-stock cleanup</h2><p className="text-sm text-muted">Select up to 100 items confirmed absent or discarded. This sets current stock to zero and logs every adjustment; it does not delete products.</p></div>
        <button type="button" disabled={!selected.length} onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-rose text-white text-sm disabled:opacity-40">Remove selected ({selected.length})</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
        <button type="button" onClick={toggleAll} disabled={!eligible.length} className="text-emerald nav-link disabled:text-muted">{allSelected ? "Clear selection" : `Select all in this review (${eligible.length})`}</button>
        {selected.length > 0 && <span className="text-muted">{selectedQty} pcs currently selected</span>}
      </div>
      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-sand divide-y divide-sand/60">
        {items.length === 0 ? <p className="p-3 text-sm text-muted">No products in this review.</p> : items.map((item) => (
          <label key={item.sku} className={`flex items-center gap-3 p-3 text-sm ${item.qty > 0 && !item.hasVariants ? "cursor-pointer hover:bg-cream/40" : "opacity-50"}`}>
            <input type="checkbox" checked={selected.includes(item.sku)} disabled={item.qty <= 0 || item.hasVariants} onChange={() => toggle(item.sku)} />
            <span className="flex-1 text-ink">{item.name} <span className="font-mono text-xs text-muted">· {item.sku}</span></span>
            <span className="text-muted">{item.qty} pcs</span><span className="text-xs capitalize text-muted">{item.hasVariants ? "manage variants individually" : item.cls}</span>
          </label>
        ))}
      </div>
      {open && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !busy && setOpen(false)}><div className="bg-white rounded-2xl shadow-luxe max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium text-ink">Confirm stock cleanup</h3><p className="text-sm text-muted mt-1">Remove {selectedQty} pcs across {selected.length} selected product{selected.length === 1 ? "" : "s"}? Product records, past bills, and movement history are kept.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required reason, e.g. physical count Aug 2026 / damaged stock" className="mt-4 w-full rounded-xl border border-sand p-3 text-sm outline-none focus:border-emerald" rows={3} required />
        <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 rounded-xl bg-ink/5 text-ink text-sm">Cancel</button><button type="button" onClick={remove} disabled={busy || !reason.trim()} className="px-4 py-2 rounded-xl bg-rose text-white text-sm disabled:opacity-50">{busy ? "Removing…" : "Confirm removal"}</button></div>
      </div></div>}
    </section>
  );
}
