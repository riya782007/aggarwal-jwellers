export const dynamic = "force-dynamic";
import { getDashboardData } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";

function isoDaysAgo(d: number) { return new Date(Date.now() - d * 86400000).toISOString(); }

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "60", label: "Last 60 days", days: 60 },
  { key: "90", label: "Last 90 days", days: 90 },
];

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-diva-ink/50">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ?? "text-diva-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-diva-ink/50 mt-1">{sub}</p>}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: { range?: string } }) {
  const range = RANGES.find((r) => r.key === searchParams.range) ?? RANGES[2];
  const d = await getDashboardData(isoDaysAgo(range.days), new Date().toISOString());

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-diva-ink">Dashboard</h1>
          <p className="text-sm text-diva-ink/60">{range.label} · live from your catalogue &amp; orders</p>
        </div>
        <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm">
          {RANGES.map((r) => (
            <a key={r.key} href={`/admin/dashboard?range=${r.key}`}
              className={`px-3 py-1.5 rounded-full text-sm ${r.key === range.key ? "bg-diva-ink text-white" : "text-diva-ink/60"}`}>
              {r.days}d
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Tile label="Revenue" value={formatPaise(d.revenue)} accent="text-diva-rose" sub={`${d.orders} orders`} />
        <Tile label="Orders" value={String(d.orders)} sub={`${d.pos} POS · ${d.cod} COD`} />
        <Tile label="Approved Retailers" value={String(d.retailers)} sub={`${d.pendingApprovals} pending approval`} />
        <Tile label="Pending Approvals" value={String(d.pendingApprovals)} accent={d.pendingApprovals ? "text-amber-600" : undefined} sub="needs owner OTP" />
        <Tile label="Total Products" value={String(d.totalProducts)} sub={`${d.newProducts} new in range`} />
        <Tile label="Categories" value={String(d.categories)} />
        <Tile label="Dead Stock" value={String(d.dead)} accent={d.dead ? "text-red-600" : undefined} sub="capital tied up" />
        <Tile label="Low Stock" value={String(d.low)} accent={d.low ? "text-amber-600" : undefined} sub={`${d.inactive} inactive`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-medium text-diva-ink mb-3">🔴 Dead stock — act now</h2>
          {d.deadList.length === 0 ? <p className="text-sm text-diva-ink/50">None 🎉</p> : (
            <ul className="text-sm divide-y divide-diva-ink/5">
              {d.deadList.map((p) => (
                <li key={p.sku} className="flex justify-between py-2"><span>{p.name} <span className="text-diva-ink/40">· {p.sku}</span></span><span className="text-diva-ink/60">{p.qty} pcs</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-medium text-diva-ink mb-3">🟡 Low stock — reorder</h2>
          {d.lowList.length === 0 ? <p className="text-sm text-diva-ink/50">None</p> : (
            <ul className="text-sm divide-y divide-diva-ink/5">
              {d.lowList.map((p) => (
                <li key={p.sku} className="flex justify-between py-2"><span>{p.name} <span className="text-diva-ink/40">· {p.sku}</span></span><span className="text-diva-ink/60">{p.qty} pcs</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
