export const dynamic = "force-dynamic";
// Poster generation (Gemini/OpenAI) can take 15–40s — raise the function timeout so it never dies at 10s.
export const maxDuration = 60;
import { redirect } from "next/navigation";
import { getCategories, getPromotionsAdmin } from "@/lib/supabase/queries";
import { requirePerm } from "@/lib/auth";
import { openaiConfigured } from "@/lib/ai/providers";
import { geminiConfigured } from "@/lib/ai/gemini";
import { PromotionsClient } from "@/components/admin/PromotionsClient";
import { setPromotionSettingsAction } from "@/app/actions/promotions";

export const metadata = { title: "Owner Console · Promotions" };

export default async function PromotionsPage() {
  if (!(await requirePerm("marketing.manage"))) redirect("/admin/dashboard?denied=promotions");
  const [cats, promos] = await Promise.all([getCategories(), getPromotionsAdmin()]);
  const categories = ((cats as any[]) ?? []).map((c) => ({ name: c.name, slug: c.slug }));
  return (
    <main className="p-4 sm:p-8 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">Promotions</h1>
      <p className="text-sm text-muted mb-5">Create festive offer posters with AI and publish them to your storefront. Type a rough idea → ChatGPT refines it → Gemini designs the poster → choose where it goes live, and it lands in the hero of the best-suited section.</p>
      <PromotionsClient categories={categories} promos={promos as any} ready={{ openai: openaiConfigured(), gemini: geminiConfigured() }} />

      {/* 0049 — Campaign settings: placement (hero / announcement strip / popup), schedule
          window with a live countdown on the strip, and an optional voucher code hook. */}
      <section className="mt-10">
        <h2 className="font-display text-2xl text-ink mb-1">Campaign settings</h2>
        <p className="text-sm text-muted mb-4">Choose where each campaign appears and when. A <b>strip</b> runs as the announcement bar on top of the store (with countdown), a <b>popup</b> greets visitors once per session, and <b>hero</b> is the big banner. Add a voucher code to show it on the strip/popup.</p>
        <div className="space-y-3">
          {(promos as any[]).filter((p) => p.status !== "archived").map((p) => (
            <form key={p.id} action={setPromotionSettingsAction} className="bg-white rounded-2xl p-4 shadow-card flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="id" value={p.id} />
              {p.image_path && <img src={p.image_path} alt="" className="h-12 w-12 rounded-lg object-cover" />}
              <span className="font-medium text-ink min-w-[120px] max-w-[200px] truncate">{p.title || "Untitled"}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === "published" ? "bg-emerald-mist text-emerald-dark" : "bg-ink/5 text-muted"}`}>{p.status}</span>
              <select name="placement" defaultValue={p.placement ?? "hero"} className="rounded-lg border border-sand px-2 py-1.5">
                <option value="hero">Hero banner</option><option value="strip">Announcement strip</option><option value="popup">Popup</option>
              </select>
              <input name="headline" defaultValue={p.headline ?? ""} placeholder="Strip/popup headline" className="rounded-lg border border-sand px-2 py-1.5 flex-1 min-w-[160px]" />
              <input name="coupon_code" defaultValue={p.coupon_code ?? ""} placeholder="Voucher code" className="rounded-lg border border-sand px-2 py-1.5 w-28 font-mono uppercase" />
              <input name="starts_at" type="date" defaultValue={p.starts_at ? String(p.starts_at).slice(0, 10) : ""} className="rounded-lg border border-sand px-2 py-1.5" title="Starts" />
              <input name="ends_at" type="date" defaultValue={p.ends_at ? String(p.ends_at).slice(0, 10) : ""} className="rounded-lg border border-sand px-2 py-1.5" title="Ends (drives the countdown)" />
              <button className="px-4 py-1.5 rounded-full bg-ink text-white text-xs">Save</button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
