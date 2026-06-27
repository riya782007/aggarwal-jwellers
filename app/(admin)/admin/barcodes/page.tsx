export const dynamic = "force-dynamic";
import { getLabelItems } from "@/lib/supabase/queries";
import { QRLabelSheet } from "@/components/admin/QRLabelSheet";
import { QRScanner } from "@/components/admin/QRScanner";

export const metadata = { title: "Owner Console · QR Labels" };

export default async function QRLabels() {
  // Products AND every colour/size variant — each with its own SKU + price.
  const list = await getLabelItems();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen">
      <div className="no-print">
        <h1 className="font-display text-4xl text-ink mb-1">QR Labels</h1>
        <p className="text-sm text-muted mb-6">Generate scannable QR tags for any product or colour variant — search a SKU, set how many labels each, choose what the QR encodes, and print a 50×25&nbsp;mm sheet for your tag gun or label printer. Any phone camera (or the scanner here) reads them.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <QRLabelSheet products={list} siteUrl={siteUrl} />
        <div className="no-print"><QRScanner /></div>
      </div>
    </main>
  );
}
