export const dynamic = "force-dynamic";
import { searchProducts } from "@/lib/supabase/queries";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { Back } from "@/components/site/Back";

export const metadata = { title: "Search", robots: { index: false } };

const SEARCH_CAP = 60; // a broad query can match thousands — cap the render so the page stays fast.

export default async function Search({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const { results, formula } = await searchProducts(q);
  const shown = results.slice(0, SEARCH_CAP);
  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="mb-4"><Back label="Back" /></div>
      <h1 className="font-display text-4xl text-ink">Search</h1>
      <form action="/search" method="get" className="mt-4 mb-3 flex items-center gap-2 max-w-xl rounded-full border border-sand bg-white px-4 py-2.5 shadow-sm">
        <input
          name="q"
          type="text"
          defaultValue={q}
          placeholder='Search "Jhumka", "Kundan Set", "Kada"…'
          enterKeyHint="search"
          autoComplete="off"
          autoFocus
          aria-label="Search jewellery"
          className="flex-1 min-h-[28px] bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
        />
        <button type="submit" className="shrink-0 rounded-full bg-emerald text-white text-sm font-medium px-4 py-1.5">Search</button>
      </form>
      <p className="text-muted mb-6">{q ? `${results.length} result${results.length === 1 ? "" : "s"} for "${q}"` : "Type a design, category, colour, or SKU to find it."}</p>
      {results.length === 0 && q && <p className="text-muted">No matches. Try a category like “necklace” or “kundan”.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {shown.map((p, i) => <Reveal key={p.sku} delay={(i % 4) * 60}><ProductCard p={p as any} formula={formula} /></Reveal>)}
      </div>
      {results.length > SEARCH_CAP && (
        <p className="mt-8 text-center text-sm text-muted">Showing the first {SEARCH_CAP} of {results.length} matches — refine your search to narrow it down.</p>
      )}
    </div>
  );
}
