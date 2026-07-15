"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction, setLangAction } from "@/app/actions/auth";
import { t, LANGS, type Lang, type I18nKey } from "@/lib/i18n";

type L = { href: string; label: I18nKey; icon: string; perm?: string };
type Perms = string[] | "*";
const GROUPS: { title: I18nKey; links: L[] }[] = [
  { title: "navOverview", links: [
    { href: "/admin/dashboard", label: "dashboard", icon: "▦" },
    { href: "/admin/analytics", label: "analytics", icon: "◷", perm: "analytics.view" },
  ]},
  { title: "navCatalog", links: [
    { href: "/admin/upload", label: "addInventory", icon: "↑", perm: "catalog.create" },
    { href: "/admin/submissions", label: "submissions", icon: "📥", perm: "catalog.create" },
    { href: "/admin/catalogue", label: "catalogue", icon: "✦", perm: "catalog.view" },
    { href: "/admin/media", label: "productPhotos", icon: "▣", perm: "catalog.ai" },
    { href: "/admin/categories", label: "categories", icon: "▦", perm: "catalog.edit" },
    { href: "/admin/pricing", label: "pricingFormula", icon: "％", perm: "catalog.price_edit" },
    { href: "/admin/inventory", label: "inventory", icon: "▤", perm: "inventory.view" },
    { href: "/admin/stock-movements", label: "stockMovement", icon: "⇅", perm: "inventory.view" },
    { href: "/admin/barcodes", label: "labels", icon: "▥", perm: "inventory.barcode" },
    { href: "/admin/reorder", label: "aiReorder", icon: "✨", perm: "inventory.view" },
  ]},
  { title: "navSales", links: [
    { href: "/admin/billing", label: "billingPos", icon: "₹", perm: "billing.sell" },
    { href: "/admin/sales", label: "salesRecords", icon: "❑", perm: "sales.view" },
    { href: "/admin/backorders", label: "backorders", icon: "⏳", perm: "sales.view" },
    { href: "/admin/estimates", label: "estimates", icon: "≈", perm: "estimates.create" },
    { href: "/admin/returns", label: "returns", icon: "⤺", perm: "billing.refund" },
    { href: "/admin/purchases", label: "purchases", icon: "⇪", perm: "purchases.view" },
    { href: "/admin/cashbook", label: "bankCash", icon: "₹", perm: "analytics.view" },
  ]},
  { title: "navPeople", links: [
    { href: "/admin/customers", label: "customers", icon: "♚", perm: "customers.view" },
    { href: "/admin/employees", label: "employees", icon: "☺", perm: "customers.view" },
    { href: "/admin/creditors", label: "udhaar", icon: "⏳", perm: "customers.view" },
    { href: "/admin/suppliers", label: "suppliers", icon: "⚒", perm: "suppliers.manage" },
    { href: "/admin/reviews", label: "reviews", icon: "★", perm: "reviews.respond" },
    { href: "/admin/abandoned", label: "abandonedCarts", icon: "⊘", perm: "marketing.manage" },
    { href: "/admin/notify", label: "notifyMe", icon: "🔔", perm: "marketing.manage" },
  ]},
  { title: "navGrowth", links: [
    { href: "/admin/promotions", label: "promotions", icon: "🎉", perm: "marketing.manage" },
    { href: "/admin/reels", label: "reels", icon: "▷", perm: "reels.manage" },
  ]},
  { title: "navControl", links: [
    { href: "/admin/approvals", label: "approvals", icon: "✓", perm: "approvals.approve" },
    { href: "/admin/inbox", label: "notifications", icon: "✉" },
    { href: "/admin/ai-activity", label: "aiActivity", icon: "🤖" },
    { href: "/admin/roles", label: "roles", icon: "⚿", perm: "roles.manage" },
  ]},
];
const EXTERNAL: L[] = [
  { href: "/shop", label: "retailStore", icon: "🛍" },
  { href: "/trade", label: "tradePortal", icon: "📦" },
  { href: "/catalog", label: "shareCatalogue", icon: "📤" },
];

const allow = (perms: Perms, perm?: string) => !perm || perms === "*" || perms.includes(perm);

function NavInner({ collapsed, onNavigate, perms, lang, badges = {} }: { collapsed: boolean; onNavigate?: () => void; perms: Perms; lang: Lang; badges?: Record<string, number> }) {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const groups = GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => allow(perms, l.perm)) })).filter((g) => g.links.length > 0);
  return (
    <>
      <nav className="space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            {!collapsed && <p className="px-3 mb-1 text-[10px] uppercase tracking-widest text-cream/35">{t(lang, g.title)}</p>}
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const badge = badges[l.href] ?? 0;
                return (
                <Link key={l.href} href={l.href} onClick={onNavigate} title={collapsed ? t(lang, l.label) : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl text-sm transition-all ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5 hover:translate-x-0.5"} ${isActive(l.href) ? "bg-white/15 text-ivory" : "text-cream/85 hover:bg-white/10"}`}>
                  <span className="w-5 text-center text-gold-light shrink-0">{l.icon}</span>
                  {!collapsed && <span className="truncate">{t(lang, l.label)}</span>}
                  {badge > 0 && (!collapsed
                    ? <span className="ml-auto text-[10px] font-semibold rounded-full bg-rose text-white px-1.5 py-0.5 min-w-[18px] text-center">{badge}</span>
                    : <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-rose" />)}
                </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-6">
        {!collapsed && <p className="px-3 mb-1 text-[10px] uppercase tracking-widest text-cream/35">{t(lang, "navStorefront")}</p>}
        <div className="space-y-0.5">
          {EXTERNAL.map((l) => (
            <Link key={l.href} href={l.href} target="_blank" onClick={onNavigate} title={collapsed ? t(lang, l.label) : undefined}
              className={`group flex items-center gap-3 rounded-xl text-sm text-cream/70 hover:bg-white/10 transition-all ${collapsed ? "justify-center py-2.5" : "px-3 py-2.5"}`}>
              <span className="w-5 text-center text-gold-light/70 shrink-0">{l.icon}</span>
              {!collapsed && <><span className="truncate">{t(lang, l.label)}</span><span className="ml-auto opacity-0 group-hover:opacity-100">↗</span></>}
            </Link>
          ))}
        </div>
      </div>
      {/* Console language — English / हिन्दी. Saved on the role (staff) or owner settings. */}
      <div className="mt-6">
        {!collapsed && <p className="px-3 mb-1 text-[10px] uppercase tracking-widest text-cream/35">{t(lang, "language")}</p>}
        <form action={setLangAction} className={`flex ${collapsed ? "flex-col items-center gap-1" : "items-center gap-1.5 px-3"}`}>
          {LANGS.map((o) => (
            <button key={o.value} name="lang" value={o.value} title={o.label}
              className={`text-xs rounded-full transition-colors ${collapsed ? "px-1.5 py-1" : "px-3 py-1.5"} ${lang === o.value ? "bg-gold text-ink font-semibold" : "bg-white/10 text-cream/70 hover:bg-white/20"}`}>
              {collapsed ? (o.value === "hi" ? "हि" : "EN") : o.label}
            </button>
          ))}
        </form>
      </div>
      <form action={logoutAction} className="mt-4">
        <button className={`w-full text-sm text-cream/70 hover:text-white transition-colors ${collapsed ? "text-center" : "text-left px-3"}`} title={t(lang, "signOut")}>{collapsed ? "↩" : `↩ ${t(lang, "signOut")}`}</button>
      </form>
    </>
  );
}

export function AdminNav({ perms = "*", roleName = "Owner", lang = "en", badges = {} }: { perms?: Perms; roleName?: string; lang?: Lang; badges?: Record<string, number> }) {
  const [open, setOpen] = useState(false);       // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  const path = usePathname();

  useEffect(() => { try { setCollapsed(localStorage.getItem("bd_nav_collapsed") === "1"); } catch {} }, []);
  useEffect(() => { setOpen(false); }, [path]); // close drawer on navigation
  function toggleCollapsed() { setCollapsed((c) => { const n = !c; try { localStorage.setItem("bd_nav_collapsed", n ? "1" : "0"); } catch {} return n; }); }

  return (
    <>
      {/* Mobile top bar */}
      <header className="no-print lg:hidden fixed top-0 inset-x-0 h-14 bg-ink text-cream z-40 flex items-center gap-3 px-4 shadow-card">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex flex-col gap-[5px] p-1">
          <span className="block h-0.5 w-6 bg-cream rounded" /><span className="block h-0.5 w-6 bg-cream rounded" /><span className="block h-0.5 w-6 bg-cream rounded" />
        </button>
        <p className="font-display text-xl text-ivory leading-none">Aggarwal Jewellers</p>
        <span className="ml-auto text-[10px] tracking-widest uppercase text-gold-light">{roleName}</span>
      </header>

      {/* Mobile drawer + overlay */}
      {open && <div className="no-print lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />}
      <aside className={`no-print lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-ink text-cream/90 z-50 px-4 py-6 overflow-y-auto transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between mb-6 px-2">
          <div>
            <p className="font-display text-2xl text-ivory leading-none">Aggarwal Jewellers</p>
            <p className="text-[10px] tracking-[0.25em] uppercase text-gold-light mt-1">Owner Console</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-cream/70 text-xl px-2">✕</button>
        </div>
        <NavInner collapsed={false} onNavigate={() => setOpen(false)} perms={perms} lang={lang} badges={badges} />
      </aside>

      {/* Desktop sidebar — sticky & self-scrolling, independent of the page scroll */}
      <aside className={`no-print hidden lg:flex shrink-0 lg:sticky lg:top-0 h-screen bg-ink text-cream/90 px-3 py-6 flex-col transition-[width] duration-200 ${collapsed ? "w-[4.75rem]" : "w-60"}`}>
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
          {!collapsed && <div>
            <p className="font-display text-2xl text-ivory leading-none">Aggarwal Jewellers</p>
            <p className="text-[10px] tracking-[0.25em] uppercase text-gold-light mt-1">{roleName === "Owner" ? "Owner Console" : roleName}</p>
          </div>}
          <button onClick={toggleCollapsed} aria-label="Collapse menu" className="text-cream/60 hover:text-white text-lg px-1">{collapsed ? "»" : "«"}</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavInner collapsed={collapsed} perms={perms} lang={lang} badges={badges} />
        </div>
        {!collapsed && (
          <div className="px-3 pt-4">
            <div className="flex items-center gap-2 text-[11px] text-cream/50">
              <span className="h-2 w-2 rounded-full bg-emerald-light animate-pulse" /> Live · Sadar Bazar, Delhi
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
