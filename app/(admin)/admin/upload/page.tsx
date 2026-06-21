export const dynamic = "force-dynamic";
import { getCategories } from "@/lib/supabase/queries";
import { UploadClient } from "@/components/admin/UploadClient";

export const metadata = { title: "Owner Console · Upload" };

export default async function UploadPage() {
  const categories = await getCategories();
  return (
    <main className="p-8 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Add Inventory</h1>
      <p className="text-sm text-muted mb-6">Category first, then designs — single or bulk. New designs go live on the storefront instantly.</p>
      <UploadClient categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
