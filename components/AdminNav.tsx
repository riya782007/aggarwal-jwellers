import Link from "next/link";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/admin/catalogue", label: "Catalogue", icon: "✦" },
  { href: "/admin/inventory", label: "Inventory", icon: "▤" },
  { href: "/admin/approvals", label: "Approvals", icon: "✓" },
  { href: "/shop", label: "Retail store ↗", icon: "🛍" },
  { href: "/wholesale", label: "Wholesale ↗", icon: "📦" },
];

export function AdminNav() {
  return (
    <aside className="w-56 shrink-0 min-h-screen bg-diva-ink text-white/90 px-4 py-6">
      <div className="px-2 mb-8">
        <p className="font-serif text-xl text-white">Blythe Diva</p>
        <p className="text-[10px] tracking-[0.2em] uppercase text-diva-gold">Owner Console</p>
      </div>
      <nav className="space-y-1">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition">
            <span className="w-4 text-center text-diva-gold">{l.icon}</span>{l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-10 px-3 text-[11px] text-white/40">Yogendra Industries · Sadar Bazar, Delhi</p>
    </aside>
  );
}
