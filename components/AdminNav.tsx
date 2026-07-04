"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";

type L = { href: string; label: string; hindi: string; icon: string; perm?: string };
type Perms = string[] | "*";

/**
 * Senior-friendly navigation: 7 big daily-use items, everything else folded
 * into "Aur Kaam". Labels are Hinglish + Hindi so the owner never has to
 * translate in his head. Icons are familiar emoji, not abstract glyphs.
 */
const DAILY: L[] = [
  { href: "/admin/dashboard", label: "Home", hindi: "होम", icon: "🏠" },
  { href: "/admin/billing", label: "Naya Bill", hindi: "बिल बनाओ", icon: "🧾", perm: "billing.sell" },
  { href: "/admin/inventory", label: "Maal (Stock)", hindi: "माल", icon: "📦", perm: "inventory.view" },
  { href: "/admin/upload", label: "Maal Jodo", hindi: "नया माल", icon: "➕", perm: "catalog.create" },
  { href: "/admin/catalogue", label: "Catalogue", hindi: "कैटलॉग", icon: "📖", perm: "catalog.view" },
  { href: "/admin/customers", label: "Grahak / Party", hindi: "ग्राहक", icon: "👥", perm: "customers.view" },
  { href: "/admin/sales", label: "Bikri (Hisaab)", hindi: "बिक्री", icon: "₹", perm: "sales.view" },
];

const MORE: L[] = [
  { href: "/admin/estimates", label: "Estimate", hindi: "भाव-पर्ची", icon: "≈", perm: "estimates.create" },
  { href: "/admin/purchases", label: "Khareed", hindi: "ख़रीद", icon: "🛒", perm: "purchases.view" },
  { href: "/admin/returns", label: "Wapsi", hindi: "वापसी", icon: "↩️", perm: "billing.refund" },
  { href: "/admin/suppliers", label: "Supplier", hindi: "सप्लायर", icon: "🏭", perm: "suppliers.manage" },
  { href: "/admin/categories", label: "Category", hindi: "श्रेणी", icon: "🗂️", perm: "catalog.edit" },
  { href: "/admin/barcodes", label: "Labels", hindi: "लेबल", icon: "🏷️", perm: "inventory.barcode" },
  { href: "/admin/reorder", label: "Smart Reorder", hindi: "रीऑर्डर", icon: "✨", perm: "inventory.view" },
  { href: "/admin/inbox", label: "Sandesh", hindi: "सूचना", icon: "✉️" },
  { href: "/admin/approvals", label: "Manzoori (OTP)", hindi: "मंज़ूरी", icon: "✅", perm: "approvals.approve" },
];

const EXTERNAL: L[] = [
  { href: "/shop", label: "Dukaan (Online)", hindi: "दुकान", icon: "🛍️" },
  { href: "/wholesale", label: "Wholesale", hindi: "थोक", icon: "📦" },
  { href: "/catalog", label: "Catalogue Bhejo", hindi: "भेजें", icon: "📤" },
];

const allow = (perms: Perms, perm?: string) => !perm || perms === "*" || perms.includes(perm);

function NavLink({ l, active, collapsed, onNavigate, small }: { l: L; active: boolean; collapsed: boolean; onNavigate?: () => void; small?: boolean }) {
  return (
    <Link href={l.href} onClick={onNavigate} title={collapsed ? `${l.label} · ${l.hindi}` : undefined}
      className={`group flex items-center gap-3 rounded-xl transition-all ${collapsed ? "justify-center px-0 py-3" : "px-3 hover:translate-x-0.5"} ${small && !collapsed ? "py-2" : "py-3"} ${active ? "bg-gold/20 text-ivory ring-1 ring-gold/40" : "text-cream/85 hover:bg-white/10"}`}>
      <span className={`text-center shrink-0 ${small ? "w-5 text-base" : "w-6 text-xl"}`}>{l.icon}</span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className={`block truncate ${small ? "text-[15px]" : "text-[17px] font-medium"}`}>{l.label}</span>
          <span className={`block truncate text-cream/50 ${small ? "text-[11px]" : "text-xs"}`}>{l.hindi}</span>
        </span>
      )}
    </Link>
  );
}

function NavInner({ collapsed, onNavigate, perms }: { collapsed: boolean; onNavigate?: () => void; perms: Perms }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const daily = DAILY.filter((l) => allow(perms, l.perm));
  const more = MORE.filter((l) => allow(perms, l.perm));
  const moreActive = more.some((l) => isActive(l.href));
  // Auto-open the "more" section when one of its pages is open.
  useEffect(() => { if (moreActive) setMoreOpen(true); }, [moreActive]);
  return (
    <>
      <nav className="space-y-1">
        {daily.map((l) => <NavLink key={l.href} l={l} active={isActive(l.href)} collapsed={collapsed} onNavigate={onNavigate} />)}
      </nav>

      {more.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <button onClick={() => setMoreOpen((o) => !o)}
            className={`w-full flex items-center gap-3 rounded-xl py-2.5 text-cream/70 hover:bg-white/10 transition-colors ${collapsed ? "justify-center" : "px-3"}`}
            title="Aur Kaam · और काम">
            <span className={`text-center shrink-0 ${collapsed ? "text-lg" : "w-6 text-lg"}`}>⋯</span>
            {!collapsed && <span className="text-[15px]">Aur Kaam <span className="text-cream/45 text-xs">· और काम</span></span>}
            {!collapsed && <span className={`ml-auto text-xs transition-transform ${moreOpen ? "rotate-180" : ""}`}>▾</span>}
          </button>
          {moreOpen && (
            <div className="mt-1 space-y-0.5">
              {more.map((l) => <NavLink key={l.href} l={l} active={isActive(l.href)} collapsed={collapsed} onNavigate={onNavigate} small />)}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/10">
        {!collapsed && <p className="px-3 mb-1 text-[11px] uppercase tracking-widest text-cream/40">Website</p>}
        <div className="space-y-0.5">
          {EXTERNAL.map((l) => (
            <Link key={l.href} href={l.href} target="_blank" onClick={onNavigate} title={collapsed ? l.label : undefined}
              className={`group flex items-center gap-3 rounded-xl text-[15px] text-cream/70 hover:bg-white/10 transition-all ${collapsed ? "justify-center py-2.5" : "px-3 py-2.5"}`}>
              <span className="w-5 text-center shrink-0">{l.icon}</span>
              {!collapsed && <><span className="truncate">{l.label}</span><span className="ml-auto opacity-0 group-hover:opacity-100">↗</span></>}
            </Link>
          ))}
        </div>
      </div>

      <form action={logoutAction} className="mt-5">
        <button className={`w-full text-[15px] text-cream/70 hover:text-white transition-colors ${collapsed ? "text-center" : "text-left px-3"}`} title="Sign out">
          {collapsed ? "↩" : "↩ Bahar Niklo · Sign out"}
        </button>
      </form>
    </>
  );
}

export function AdminNav({ perms = "*", roleName = "Owner" }: { perms?: Perms; roleName?: string }) {
  const [open, setOpen] = useState(false);       // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  const path = usePathname();

  useEffect(() => { try { setCollapsed(localStorage.getItem("bd_nav_collapsed") === "1"); } catch {} }, []);
  useEffect(() => { setOpen(false); }, [path]); // close drawer on navigation
  function toggleCollapsed() { setCollapsed((c) => { const n = !c; try { localStorage.setItem("bd_nav_collapsed", n ? "1" : "0"); } catch {} return n; }); }

  return (
    <>
      {/* Mobile top bar */}
      <header className="no-print lg:hidden fixed top-0 inset-x-0 h-16 bg-ink text-cream z-40 flex items-center gap-3 px-4 shadow-card">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex flex-col gap-[6px] p-2 -ml-2">
          <span className="block h-[3px] w-7 bg-cream rounded" /><span className="block h-[3px] w-7 bg-cream rounded" /><span className="block h-[3px] w-7 bg-cream rounded" />
        </button>
        <p className="font-display text-2xl text-ivory leading-none">Aggarwal Jewellers</p>
        <span className="ml-auto text-[11px] tracking-widest uppercase text-gold-light">{roleName}</span>
      </header>

      {/* Mobile drawer + overlay */}
      {open && <div className="no-print lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />}
      <aside className={`no-print lg:hidden fixed top-0 left-0 bottom-0 w-80 bg-ink text-cream/90 z-50 px-4 py-6 overflow-y-auto transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between mb-6 px-2">
          <div>
            <p className="font-display text-2xl text-ivory leading-none">Aggarwal Jewellers</p>
            <p className="text-[11px] tracking-[0.25em] uppercase text-gold-light mt-1">Sadar Bazar · Delhi</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-cream/70 text-2xl px-2">✕</button>
        </div>
        <NavInner collapsed={false} onNavigate={() => setOpen(false)} perms={perms} />
      </aside>

      {/* Desktop sidebar — sticky & self-scrolling, independent of the page scroll */}
      <aside className={`no-print hidden lg:flex shrink-0 lg:sticky lg:top-0 h-screen bg-ink text-cream/90 px-3 py-6 flex-col transition-[width] duration-200 ${collapsed ? "w-[5rem]" : "w-[17rem]"}`}>
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
          {!collapsed && <div>
            <p className="font-display text-2xl text-ivory leading-none">Aggarwal Jewellers</p>
            <p className="text-[11px] tracking-[0.25em] uppercase text-gold-light mt-1">{roleName === "Owner" ? "Malik ka Console" : roleName}</p>
          </div>}
          <button onClick={toggleCollapsed} aria-label="Collapse menu" className="text-cream/60 hover:text-white text-lg px-1">{collapsed ? "»" : "«"}</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavInner collapsed={collapsed} perms={perms} />
        </div>
        {!collapsed && (
          <div className="px-3 pt-4">
            <div className="flex items-center gap-2 text-[12px] text-cream/50">
              <span className="h-2 w-2 rounded-full bg-emerald-light animate-pulse" /> Live · Sadar Bazar, Delhi
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
