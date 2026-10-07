export const dynamic = "force-dynamic";
import { PrinterSettings } from "@/components/admin/PrinterSettings";

export const metadata = { title: "Owner Console · Label Printer" };

export default function PrinterPage({ searchParams }: { searchParams: { setup?: string } }) {
  return (
    <main className="p-4 sm:p-6 pb-28 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Label Printer</h1>
      <p className="text-sm text-muted mb-6">Connect the Bluetooth sticker printer once. After that, every <b>Print labels</b> button in the app prints straight to it.</p>
      <PrinterSettings setup={searchParams?.setup === "1"} />
    </main>
  );
}
