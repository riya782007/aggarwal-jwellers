"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { combineSizesAction } from "@/app/actions/variants";

/** "Combine sizes into one item" — turns a sized/coloured product into ONE item with a single QR
 *  (owner request, Nov 2026). See combineSizesAction for exactly what happens to each size. */
export function CombineSizesButton({ sku, sizes, total }: { sku: string; sizes: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function confirm() {
    setBusy(true);
    const fd = new FormData(); fd.set("product_sku", sku);
    const r = await combineSizesAction(fd);
    setBusy(false); setOpen(false);
    toast(r.message, r.ok ? "success" : "error");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sand bg-white text-ink text-xs hover:bg-cream">
        Combine sizes into one item
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-luxe max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-ink">Make <span className="font-mono">{sku}</span> one item with a single QR?</p>
            <ul className="text-sm text-muted mt-2 space-y-1 list-disc pl-5">
              <li>All {sizes} sizes/colours become <b className="text-ink">one item with {total} pcs</b> under <span className="font-mono">{sku}</span>.</li>
              <li>Size stickers already on boxes <b className="text-ink">keep scanning</b> — as this one item.</li>
              <li>Old bills stay exactly as they were (sizes already sold are kept in a hidden &ldquo;old sizes&rdquo; record).</li>
              <li>Afterwards, use <b className="text-ink">Print labels</b> to get the new single QR sticker.</li>
            </ul>
            <p className="text-xs text-rose mt-3">This can&apos;t be undone from the screen.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 rounded-xl bg-ink/5 text-ink text-sm hover:bg-ink/10">Cancel</button>
              <button onClick={confirm} disabled={busy} className="px-4 py-2 rounded-xl bg-ink text-white text-sm hover:opacity-90 disabled:opacity-50">{busy ? "Combining…" : "Combine into one item"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
