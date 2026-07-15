export const dynamic = "force-dynamic";
import { QuoteRequestForm } from "@/components/site/QuoteRequestForm";
import { getWholesaleSession } from "@/lib/wholesale";
import Link from "next/link";

export const metadata = { title: "Request a Quote · Aggarwal Jewellers Trade" };

export default async function TradeQuote() {
  const session = await getWholesaleSession();
  return (
    <div className="max-w-2xl mx-auto px-5 py-10">
      <Link href="/trade" className="text-sm text-muted hover:text-ink">← Trade portal</Link>
      <h1 className="font-display text-4xl text-ink mt-2 mb-1">Request a quote</h1>
      <p className="text-sm text-muted mb-6">Bulk order or a design you don&apos;t see listed? Tell us what you need and quantities — we reply with rates on WhatsApp, usually within a few hours.</p>
      <QuoteRequestForm defaultName={session?.name ?? ""} loggedIn={!!session} />
    </div>
  );
}
