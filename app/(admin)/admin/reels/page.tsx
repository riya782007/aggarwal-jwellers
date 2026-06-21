export const dynamic = "force-dynamic";
import { getAdminReels } from "@/lib/supabase/queries";
import { createReelAction, deleteReelAction } from "@/app/actions/reels";

export const metadata = { title: "Owner Console · Reels" };

export default async function AdminReels() {
  const reels = await getAdminReels();
  const input = "w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald";
  return (
    <main className="p-8 bg-cream/40 min-h-screen max-w-3xl">
      <h1 className="font-display text-4xl text-ink mb-1">Shoppable Reels</h1>
      <p className="text-sm text-muted mb-6">Tag products to a reel — they appear on the storefront as “watch &amp; shop”. Customers tap the look and buy.</p>

      <div className="bg-white rounded-2xl p-6 shadow-card mb-6">
        <h2 className="font-medium text-ink mb-3">Add a reel</h2>
        <form action={createReelAction} className="space-y-3">
          <input name="caption" placeholder="Caption (e.g. Bridal Kundan edit ✨)" className={input} />
          <input name="video_url" placeholder="Video URL (optional — .mp4 or Instagram link)" className={input} />
          <input name="skus" placeholder="Product SKUs to tag, e.g. BD1000, BD1001, BD1016" className={input} />
          <button className="btn-primary px-6 py-2.5 text-sm font-medium">Add reel</button>
        </form>
      </div>

      <div className="space-y-3">
        {reels.map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl p-5 shadow-card flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-ink truncate">{r.caption}</p>
              <p className="text-xs text-muted mt-1">{r.products.length ? r.products.map((p: any) => p.sku).join(", ") : "no products tagged"}</p>
            </div>
            <form action={deleteReelAction}><input type="hidden" name="id" value={r.id} /><button className="text-muted hover:text-rose text-sm">Delete</button></form>
          </div>
        ))}
      </div>
    </main>
  );
}
