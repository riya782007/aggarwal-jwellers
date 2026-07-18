export const dynamic = "force-dynamic";
import { TableSearch } from "@/components/admin/TableSearch";
import { supabaseServer } from "@/lib/supabase/server";

/** AI task history — every action DIVA has taken, with input, outcome and time. */
export default async function AiActivity() {
  let rows: any[] = [];
  try {
    const { data } = await supabaseServer()
      .from("agent_runs")
      .select("id,agent,trigger,input,output,needs_human,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = (data as any[]) ?? [];
  } catch { /* table optional */ }

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink">AI Activity</h1>
        <p className="text-sm text-muted mt-1">Everything DIVA has done — command, action, result and time. The last 100 runs.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card p-10 text-center text-muted">
          No AI activity yet. Ask DIVA to do something — every action lands here automatically.
        </div>
      ) : (
        <>
        <div className="mb-3"><TableSearch targetId="ai-table" placeholder="Search AI activity…" /></div>
        <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
          <table id="ai-table" className="w-full text-[15px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-sand/60">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Input</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {rows.map((r) => {
                const out = (r.output ?? {}) as { ok?: boolean; message?: string };
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{r.trigger}</span>
                      {r.needs_human && <span className="ml-2 text-[10px] text-gold-dark">confirmed</span>}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[220px]">
                      <code className="text-xs break-all">{JSON.stringify(r.input ?? {}).slice(0, 120)}</code>
                    </td>
                    <td className="px-4 py-3 max-w-[380px]">
                      <span className={`inline-block mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${out.ok ? "bg-emerald-mist text-emerald" : "bg-rose/10 text-rose"}`}>{out.ok ? "OK" : "FAILED"}</span>
                      <span className="text-ink/80">{String(out.message ?? "").slice(0, 200)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </main>
  );
}
