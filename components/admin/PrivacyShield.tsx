"use client";
import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";

/**
 * Privacy toggle — one tap hides the WHOLE screen. Instead of blurring individual
 * `.sensitive` numbers (which missed figures on some pages), turning it on now drops a
 * full-viewport frosted-glass layer over the entire interface — content, sidebar, DIVA,
 * everything — so it is always safe to show in-store, on every admin page.
 *
 * Toggle via the floating button OR Ctrl/⌘ + Shift + H. The choice is remembered on this
 * device and synced across tabs. Printing ignores the shield.
 */
export function PrivacyShield({ children, className = "", lang = "en" }: { children: React.ReactNode; className?: string; lang?: Lang }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(typeof window !== "undefined" && localStorage.getItem("bd_privacy") === "1"); }, []);

  const set = (v: boolean) => { setHidden(v); try { localStorage.setItem("bd_privacy", v ? "1" : "0"); } catch { /* private mode */ } };
  const toggle = () => set(!hidden);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        set(localStorage.getItem("bd_privacy") !== "1");
      }
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "bd_privacy") setHidden(e.newValue === "1"); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("storage", onStorage); };
  }, []);

  return (
    <div className={className}>
      {children}
      {/* Frosted layer over the ENTIRE viewport (nav + content + assistant). */}
      {hidden && (
        <div className="privacy-overlay no-print fixed inset-0 z-[54] flex items-center justify-center" aria-hidden>
          <div className="text-center select-none">
            <p className="text-5xl mb-3">🔒</p>
            <p className="text-ink font-medium">{t(lang, "privacyHiddenMsg")}</p>
            <p className="text-xs text-muted mt-1">Ctrl/⌘ + Shift + H</p>
          </div>
        </div>
      )}
      <button onClick={toggle} title={`${hidden ? t(lang, "privacyShow") : t(lang, "privacyHide")} (Ctrl/⌘ + Shift + H)`}
        className="no-print fixed bottom-24 right-5 z-[56] px-4 py-2.5 rounded-full bg-ink text-white text-sm shadow-luxe hover:bg-ink/90 transition-colors flex items-center gap-1.5">
        {hidden ? `🙈 ${t(lang, "privacyShow")}` : `👁 ${t(lang, "privacyHide")}`}
        <kbd className="text-[9px] font-sans opacity-60 border border-white/30 rounded px-1 leading-none py-0.5">⌃⇧H</kbd>
      </button>
    </div>
  );
}
