export const dynamic = "force-dynamic";
import { searchProducts } from "@/lib/supabase/queries";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { Back } from "@/components/site/Back";

export const metadata = { title: "Search", robots: { index: false } };

export default async function Search({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const { results, formula } = await searchProducts(q);
  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="mb-4"><Back label="Back" /></div>
      <h1 className="font-display text-4xl text-ink">Search</h1>
      <form action="/search" className="mb-4 flex max-w-xl items-center gap-2 rounded-full border border-sand bg-white px-4 py-2.5 focus-within:border-gold">
        <input name="q" type="search" defaultValue={q} placeholder='Search "Jhumka", "Kundan Set", "Kada"…' aria-label="Search designs" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/40" />
        <button type="submit" className="shrink-0 text-sm font-medium text-emerald hover:text-ink">Search</button>
      </form>
      <p className="text-muted mb-6">{q ? `${results.length} result${results.length === 1 ? "" : "s"} for "${q}"` : "Type a design, category, or SKU to find it."}</p>
      {results.length === 0 && q && <p className="text-muted">No matches. Try a category like “necklace” or “kundan”.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {results.map((p, i) => <Reveal key={p.sku} delay={(i % 4) * 60}><ProductCard p={p as any} formula={formula} /></Reveal>)}
      </div>
    </div>
  );
}
