export const dynamic = "force-dynamic";
import { getInventoryClassified } from "@/lib/supabase/queries";

const BADGE: Record<string, string> = {
  dead: "bg-red-100 text-red-700", low: "bg-amber-100 text-amber-700",
  inactive: "bg-slate-200 text-slate-700", healthy: "bg-green-100 text-green-700",
};

function daysSince(iso: string | null) {
  if (!iso) return "never";
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + "d ago";
}

export default async function Inventory({ searchParams }: { searchParams: { deadDays?: string; lowQty?: string; cls?: string } }) {
  const deadDays = Math.max(1, parseInt(searchParams.deadDays ?? "30", 10) || 30);
  const lowQty = Math.max(0, parseInt(searchParams.lowQty ?? "2", 10) || 2);
  const rows = await getInventoryClassified({ deadDays, lowQty });
  const filter = searchParams.cls;
  const shown = filter ? rows.filter((r) => r.cls === filter) : rows;
  const counts = rows.reduce((a, r) => { a[r.cls] = (a[r.cls] ?? 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl text-diva-ink mb-1">Inventory Intelligence</h1>
      <p className="text-sm text-diva-ink/60 mb-5">Rule: no movement in <b>{deadDays}</b> days OR ≤ <b>{lowQty}</b> pcs. Change it and the classification updates live.</p>

      <form className="flex flex-wrap items-end gap-3 mb-5 bg-white rounded-xl p-4 shadow-sm">
        <label className="text-sm">Dead after (days)
          <input name="deadDays" defaultValue={deadDays} type="number" className="mt-1 block w-28 rounded border border-diva-ink/15 px-2 py-1" />
        </label>
        <label className="text-sm">Low at or below (pcs)
          <input name="lowQty" defaultValue={lowQty} type="number" className="mt-1 block w-28 rounded border border-diva-ink/15 px-2 py-1" />
        </label>
        <button className="px-4 py-2 rounded-full bg-diva-ink text-white text-sm">Apply rule</button>
      </form>

      <div className="flex gap-2 mb-4">
        {["dead", "low", "inactive", "healthy"].map((c) => (
          <a key={c} href={`/admin/inventory?deadDays=${deadDays}&lowQty=${lowQty}&cls=${c}`}
            className={`px-3 py-1.5 rounded-full text-sm capitalize ${BADGE[c]} ${filter === c ? "ring-2 ring-diva-ink/30" : ""}`}>
            {c} · {counts[c] ?? 0}
          </a>
        ))}
        <a href={`/admin/inventory?deadDays=${deadDays}&lowQty=${lowQty}`} className="px-3 py-1.5 rounded-full text-sm bg-white text-diva-ink/60">All · {rows.length}</a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-diva-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-diva-cream text-diva-ink/60 text-left">
            <tr><th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Qty</th><th className="p-3">Last movement</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sku} className="border-t border-diva-ink/5">
                <td className="p-3 text-diva-ink">{r.name} <span className="text-diva-ink/40">· {r.sku}</span></td>
                <td className="p-3 text-diva-ink/60">{r.category}</td>
                <td className="p-3">{r.qty}</td>
                <td className="p-3 text-diva-ink/60">{daysSince(r.lastMovementAt)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${BADGE[r.cls]}`}>{r.cls}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
