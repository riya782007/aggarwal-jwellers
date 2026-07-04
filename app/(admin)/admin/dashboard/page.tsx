export const dynamic = "force-dynamic";
import Link from "next/link";
import { getDashboardData, getDashboardAnalytics } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { AnimatedNumber } from "@/components/admin/AnimatedNumber";

/**
 * Home — designed for an older, non-technical owner.
 * Rules: one screen, no charts to decode, no date pickers.
 * Three questions answered at a glance:
 *   1. Aaj kitna bika?  2. Kaunsa maal khatam ho raha hai?  3. Ab kya karna hai?
 */

const PRESETS = [
  { key: "today", label: "Aaj", hindi: "आज" },
  { key: "week", label: "Is Hafte", hindi: "इस हफ़्ते" },
  { key: "month", label: "Is Mahine", hindi: "इस महीने" },
];

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else if (preset === "week") { const day = (now.getDay() + 6) % 7; start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0); }
  else { start.setDate(1); start.setHours(0, 0, 0, 0); } // month
  return { from: start.toISOString(), to: now.toISOString() };
}

/** Big tappable action — the owner's whole day in four buttons. */
function BigAction({ href, icon, label, hindi, accent }: { href: string; icon: string; label: string; hindi: string; accent?: boolean }) {
  return (
    <Link href={href}
      className={`flex items-center gap-4 rounded-2xl p-5 sm:p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-luxe active:scale-[0.99] ${accent ? "bg-emerald text-white" : "bg-white text-ink"}`}>
      <span className="text-4xl leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold leading-tight">{label}</span>
        <span className={`block text-sm mt-0.5 ${accent ? "text-white/75" : "text-muted"}`}>{hindi}</span>
      </span>
      <span className={`ml-auto text-2xl ${accent ? "text-white/70" : "text-gold-dark"}`}>›</span>
    </Link>
  );
}

function BigNumber({ label, hindi, children, sub, tone }: { label: string; hindi: string; children: React.ReactNode; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald" : tone === "warn" ? "text-gold-dark" : tone === "bad" ? "text-rose" : "text-ink";
  const bar = tone === "good" ? "bg-emerald" : tone === "warn" ? "bg-gold-dark" : tone === "bad" ? "bg-rose" : "bg-sand";
  return (
    <div className="relative bg-white rounded-2xl p-5 sm:p-6 shadow-card overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${bar}`} />
      <p className="text-[15px] text-muted">{label} <span className="text-muted/70">· {hindi}</span></p>
      <p className={`text-4xl font-semibold mt-2 count-tabular ${color}`}>{children}</p>
      {sub && <p className="text-[15px] text-muted mt-1.5">{sub}</p>}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: { preset?: string; denied?: string } }) {
  const preset = PRESETS.find((p) => p.key === searchParams.preset)?.key ?? "today";
  const { from, to } = presetRange(preset);
  const [d, a] = await Promise.all([getDashboardData(from, to), getDashboardAnalytics(from, to)]);
  const label = PRESETS.find((p) => p.key === preset)!;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Suprabhat" : hour < 17 ? "Namaste" : "Shubh Sandhya";

  return (
    <main className="admin-shell p-4 sm:p-8 bg-cream/40 min-h-screen max-w-6xl">
      {searchParams.denied && (
        <div className="mb-4 rounded-xl bg-rose/10 text-rose px-4 py-3 text-[15px]">Aapke paas <b>{searchParams.denied}</b> ka access nahi hai. Malik se poochhiye.</div>
      )}

      {/* Greeting + period pills */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl text-ink">{greet} 🙏</h1>
          <p className="text-[15px] text-muted mt-1">Aggarwal Jewellers · Sadar Bazar</p>
        </div>
        <div className="flex gap-1.5 bg-white rounded-full p-1.5 shadow-card self-start sm:self-auto">
          {PRESETS.map((p) => (
            <a key={p.key} href={`/admin/dashboard?preset=${p.key}`}
              className={`px-5 py-2.5 rounded-full text-[16px] font-medium transition-colors ${preset === p.key ? "bg-ink text-ivory" : "text-ink/70 hover:bg-cream"}`}>
              {p.label}
            </a>
          ))}
        </div>
      </div>

      {/* The three numbers that matter */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <BigNumber label={`${label.label} ki Bikri`} hindi="बिक्री" tone="good" sub={`${d.orders} bill bane`}>
          <AnimatedNumber value={d.revenue / 100} prefix="₹" />
        </BigNumber>
        <BigNumber label="Kam Stock" hindi="कम माल" tone={d.low ? "warn" : undefined} sub={d.low ? "jaldi mangwana hai" : "sab theek hai ✓"}>
          <AnimatedNumber value={d.low} />
        </BigNumber>
        <BigNumber label="Ruka hua Maal" hindi="नहीं बिक रहा" tone={d.dead ? "bad" : undefined} sub={d.dead ? "paisa fasa hai — clearance karein" : "kuch nahi ✓"}>
          <AnimatedNumber value={d.dead} />
        </BigNumber>
      </div>

      {/* What do you want to do? */}
      <p className="text-[15px] text-muted mb-2.5">Kya karna hai? <span className="text-muted/70">· क्या करना है?</span></p>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <BigAction href="/admin/billing" icon="🧾" label="Naya Bill Banao" hindi="नया बिल बनाओ" accent />
        <BigAction href="/admin/upload" icon="➕" label="Naya Maal Jodo" hindi="नया माल जोड़ो" />
        <BigAction href="/admin/inventory" icon="📦" label="Stock Dekho" hindi="माल देखो" />
        <BigAction href="/catalog" icon="📤" label="Catalogue Bhejo" hindi="कैटलॉग भेजो" />
      </div>

      {/* Simple lists — no charts to decode */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-semibold text-ink mb-1">⭐ Sabse zyada bik raha hai</h2>
          <p className="text-sm text-muted mb-4">{label.label.toLowerCase()} ke top sellers</p>
          <ul className="divide-y divide-sand/60">
            {a.topProducts.length === 0 ? <li className="py-3 text-muted text-[15px]">Abhi koi bikri nahi hui.</li> : a.topProducts.map((p) => (
              <li key={p.name} className="flex justify-between items-center py-3 text-[16px]">
                <span className="truncate pr-3">{p.name}</span>
                <span className="text-emerald font-semibold whitespace-nowrap">{formatPaise(p.revenue)}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/sales" className="inline-block mt-4 text-[15px] text-emerald nav-link">Poora hisaab dekho →</Link>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-semibold text-rose mb-1">🔴 Ruka hua maal</h2>
          <p className="text-sm text-muted mb-4">bahut dino se nahi bika — dhyaan dijiye</p>
          <ul className="divide-y divide-sand/60">
            {d.deadList.length === 0 ? <li className="py-3 text-muted text-[15px]">Kuch nahi rukha 🎉</li> : d.deadList.map((p) => (
              <li key={p.sku} className="flex justify-between items-center py-3 text-[16px]">
                <span className="truncate pr-3">{p.name}</span>
                <span className="text-muted whitespace-nowrap">{p.qty} pcs</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/inventory" className="inline-block mt-4 text-[15px] text-emerald nav-link">Poora stock dekho →</Link>
        </div>
      </div>
    </main>
  );
}
