"use client";
import { Icon } from "@/components/ui/Icon";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { makeLabelsPdf } from "@/lib/labelPdf";
import { priceCodeFromPaise } from "@/lib/priceCode";

/**
 * "Print labels" straight from a catalogue row — the same thermal 2in × 1in sticker the
 * QR & Barcode Labels page produces (same makeLabelsPdf, same QR payload, same A·7w7·r·51
 * price code from lib/priceCode), so a tag printed here is indistinguishable from one printed
 * there. Saves the owner the trip to /admin/barcodes for the common "just reprint this item" case.
 *
 * A design with colour/size variants has a DIFFERENT SKU and possibly its own price per variant,
 * and this row only carries the parent's price. Printing the parent SKU onto a variant's tag would
 * put the wrong code on a physical item, so those open the labels page instead, pre-queued with
 * every variant (?sku= expands them there with each variant's own resolved price).
 */
export function PrintLabelsButton({
  sku, name, qty, pricePaise, wholesalePaise, hasVariants, className,
}: {
  sku: string;
  name: string;
  /** Current stock — the default number of stickers, exactly like the labels page. */
  qty: number;
  pricePaise?: number;
  wholesalePaise?: number;
  hasVariants: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const base = className ?? "px-3 py-1.5 rounded-full bg-ink/5 text-ink text-xs hover:bg-ink/10 inline-flex items-center gap-1 disabled:opacity-50";
  const count = Math.max(1, Math.floor(qty || 1));

  // Variants: hand off to the labels page, which queues every colour with its own price.
  if (hasVariants) {
    return (
      <button
        type="button"
        className={base}
        title="This design has colour/size variants — open the labels page with every variant queued"
        onClick={(e) => { e.stopPropagation(); router.push(`/admin/barcodes?sku=${encodeURIComponent(sku)}`); }}
      >
        <Icon g="🖶" className="w-3 h-3" />Print labels
      </button>
    );
  }

  async function print(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const priceLine = priceCodeFromPaise(wholesalePaise, pricePaise);
      // Same shape the labels page builds: QR encodes the internal SKU only (no web link).
      const labels = Array.from({ length: count }, () => ({
        name, sku, qrValue: sku,
        priceLine: priceLine || undefined,
        showName: true, showSku: true,
      }));
      await makeLabelsPdf(labels, "print");
    } catch (err: any) {
      alert(err?.message || "Couldn't generate the labels.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={print}
      disabled={busy}
      className={base}
      title={`Print ${count} thermal label${count === 1 ? "" : "s"} for ${sku} (default = current stock)`}
    >
      <Icon g="🖶" className="w-3 h-3" />{busy ? "Preparing…" : `Print labels (${count})`}
    </button>
  );
}
