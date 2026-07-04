import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Assistant } from "@/components/site/Assistant";
import { getCategories } from "@/lib/supabase/queries";
import { CartProvider } from "@/components/cart/CartContext";
import { WishlistProvider } from "@/components/wishlist/WishlistContext";

export const dynamic = "force-dynamic";

export default async function RetailLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories();
  const cats = categories.map((c) => ({ name: c.name, slug: c.slug }));
  return (
    <CartProvider><WishlistProvider><div className="min-h-screen flex flex-col bg-white">
      <Header categories={cats} />
      <main className="flex-1">{children}</main>
      <Footer categories={cats} />
      <Assistant />
    </div></WishlistProvider></CartProvider>
  );
}
