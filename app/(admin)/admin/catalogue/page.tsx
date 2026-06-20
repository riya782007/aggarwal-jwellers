export const dynamic = "force-dynamic";

import Link from "next/link";
import { getPublishedProducts, getPricingFormula } from "@/lib/supabase/queries";
import { liveOffer } from "@/lib/offers";
import { formatPaise } from "@/lib/pricing";
import { geminiConfigured } from "@/lib/ai/gemini";
import { ProductImage, isRealImage } from "@/components/Placeholder";
import { generateOneAction, generateAllAction } from "@/app/actions/images";

export const metadata = { title: "Owner Console · Catalogue" };

export default async function AdminCatalogue() {
  const [products, formula] = await Promise.all([getPublishedProducts(), getPricingFormula()]);
  const connected = geminiConfigured();

  async function genOne(formData: FormData) { "use server"; await generateOneAction(String(formData.get("sku"))); }
  async function genAll() { "use server"; await generateAllAction(); }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-diva-ink">Catalogue</h1>
          <p className="text-sm text-diva-ink/60">{products.length} products · pages auto-generated with live pricing &amp; SEO</p>
        </div>
        <form action={genAll}>
          <button className="px-5 py-2.5 rounded-full bg-diva-ink text-white text-sm font-medium">
            ✨ Generate all professional photos
          </button>
        </form>
      </div>

      <div className={`mb-5 rounded-xl px-4 py-3 text-sm ${connected ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
        {connected
          ? "Gemini image model connected — Generate buttons will produce ready-to-publish model shots."
          : "Gemini not connected yet. Buttons are wired and show the exact prompt that will run. Add GEMINI_API_KEY to go live."}
      </div>

      <div className="overflow-x-auto rounded-xl border border-diva-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-diva-cream text-diva-ink/60 text-left">
            <tr>
              <th className="p-3">Photo</th><th className="p-3">Product</th><th className="p-3">Category · No.</th>
              <th className="p-3">Price (live)</th><th className="p-3">Page</th><th className="p-3">AI Photo</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const o = liveOffer(p.base_wholesale, formula);
              const hasPhoto = false; // would check for a real generated image
              return (
                <tr key={p.id} className="border-t border-diva-ink/5">
                  <td className="p-2"><div className="w-12 h-14 rounded overflow-hidden"><ProductImage name={p.name} /></div></td>
                  <td className="p-3 font-medium text-diva-ink">{p.name}</td>
                  <td className="p-3 text-diva-ink/60">{p.category.name} · {p.sku}</td>
                  <td className="p-3">
                    <span className="font-semibold">{formatPaise(o.price)}</span>{" "}
                    {o.hasOffer && <span className="text-xs text-diva-rose">{o.offerPct}% off</span>}
                  </td>
                  <td className="p-3"><Link className="text-diva-rose underline" href={`/shop/${p.category.slug}/${p.sku}`}>/shop/{p.category.slug}/{p.sku}</Link></td>
                  <td className="p-3">
                    <form action={genOne}>
                      <input type="hidden" name="sku" value={p.sku} />
                      <button className="px-3 py-1.5 rounded-full bg-diva-rose/10 text-diva-rose text-xs font-medium hover:bg-diva-rose/20">Generate</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}