export const dynamic = "force-dynamic";
import { getPosCatalog, getCustomersDb, getPaymentMethods, getEmployees } from "@/lib/supabase/queries";
import { POSClient } from "@/components/admin/POSClient";

export const metadata = { title: "Owner Console · Billing (POS)" };

export default async function Billing() {
  // Lean catalogue (no reviews/images) + paged variants so every colour SKU is scannable.
  const [list, customers, methods, employees] = await Promise.all([
    getPosCatalog(),
    getCustomersDb({}),
    getPaymentMethods({ activeOnly: true }),
    getEmployees({ activeOnly: true }),
  ]);
  const custList = customers.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone ?? "", type: c.type ?? "retail", gstin: c.gstin ?? "" }));
  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Billing · Point of Sale</h1>
      <p className="text-sm text-muted mb-6">Ring up a counter sale. Stock and books update the instant you complete it.</p>
      <POSClient products={list} customers={custList} methods={methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind }))} employees={employees.map((e) => ({ id: e.id, name: e.name }))} />
    </main>
  );
}
