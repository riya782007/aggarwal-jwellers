export const dynamic = "force-dynamic";
import { getLabelItems } from "@/lib/supabase/queries";
import { BarcodeSheet } from "@/components/admin/BarcodeSheet";

export const metadata = { title: "Owner Console · QR & Barcode Labels" };

export default async function Barcodes() {
  // Products AND every colour/size variant — each with its own SKU + price (Pillar 11).
  const list = await getLabelItems();
  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <div className="no-print">
        <h1 className="font-display text-4xl text-ink mb-1">QR &amp; Barcode Labels</h1>
        <p className="text-sm text-muted mb-6">Generate scannable <b>QR</b> labels (default — phone cameras and 2D scanners read them, and they survive smudging) or classic Code-128 barcodes for any product or colour variant. Search a SKU, set how many labels each, and print a sheet for your tag gun or label printer.</p>
      </div>
      <BarcodeSheet products={list} />
    </main>
  );
}
