export const dynamic = "force-dynamic";
import { getLabelItems, getBoxGroups } from "@/lib/supabase/queries";
import { BarcodeSheet } from "@/components/admin/BarcodeSheet";
import { BoxQrMaker } from "@/components/admin/BoxQrMaker";

export const metadata = { title: "Owner Console · QR & Barcode Labels" };

export default async function Barcodes({ searchParams }: { searchParams: { sku?: string; skus?: string } }) {
  // Products AND every colour/size variant — each with its own SKU + price (Pillar 11).
  const [list, boxGroups] = await Promise.all([getLabelItems(), getBoxGroups()]);
  // Deep-link from "Add Inventory / Purchase → Print labels": pre-queue these SKUs (and their
  // variants) to print. `?sku=` is a single item; `?skus=a,b,c` is a whole purchase bill.
  const initialSkus = [
    ...((searchParams?.sku ?? "").trim() ? [String(searchParams.sku).trim()] : []),
    ...((searchParams?.skus ?? "").split(",")),
  ].map((s) => s.trim()).filter(Boolean);
  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <div className="no-print">
        <h1 className="font-display text-4xl text-ink mb-1">QR &amp; Barcode Labels</h1>
        <p className="text-sm text-muted mb-6">Generate scannable <b>QR</b> labels (default — phone cameras and 2D scanners read them, and they survive smudging) or classic Code-128 barcodes for any product or colour variant. Search a SKU and print a sheet for your tag gun or label printer. The number of labels for each item is <b>pre-filled from its current stock</b> — just print. You can still edit any count if you need more or fewer.</p>
      </div>
      <BoxQrMaker products={list.map((p) => ({ sku: p.sku, name: p.name, qty: p.qty }))} groups={boxGroups} />
      <BarcodeSheet products={list} initialSkus={initialSkus} />
    </main>
  );
}
