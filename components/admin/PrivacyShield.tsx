"use client";
import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

/**
 * Privacy toggle — one tap hides the WHOLE screen. Instead of blurring individual
 * `.sensitive` numbers (which missed figures on some pages), turning it on now drops a
 * full-viewport frosted-glass layer over the entire interface — content, sidebar, DIVA,
 * everything — so it is always safe to show in-store, on every admin page.
 *
 * WHERE THE CONTROL LIVES (changed Sept 2026)
 * It used to be a pill floating at the bottom-left of every page. Floating over the bottom of the
 * screen means sitting on top of whatever the page puts there: on the Labels page it covered the
 * "Label Type" selector, and next to the host's bottom-right badge it walled off the whole bottom
 * strip. It now lives in the menu (see PrivacyToggle, rendered by AdminNav) — a place staff can
 * find on purpose and that can never cover a control.
 *
 * Turning it back OFF does not depend on the menu: the shield itself is the button (the menu is
 * underneath the frosted layer, so relying on it would trap the user), and Ctrl/⌘ + Shift + H
 * still toggles both ways from anywhere.
 *
 * The choice is remembered on this device, synced across tabs (`storage`) and across components
 * in the same tab (`bd-privacy`, since `storage` does not fire in the tab that wrote it).
 * Printing ignores the shield.
 */
/** One key, one channel — shared by the shield and by the menu item that switches it. */
export const PRIVACY_EVENT = "bd-privacy";
export function readPrivacy(): boolean {
  try { return localStorage.getItem("bd_privacy") === "1"; } catch { return false; }
}
export function writePrivacy(v: boolean) {
  try { localStorage.setItem("bd_privacy", v ? "1" : "0"); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(PRIVACY_EVENT)); } catch { /* SSR */ }
}

export function PrivacyShield({ children, className = "", lang = "en" }: { children: React.ReactNode; className?: string; lang?: Lang }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(readPrivacy()); }, []);

  const set = (v: boolean) => { setHidden(v); writePrivacy(v); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        set(readPrivacy() !== true);
      }
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "bd_privacy") setHidden(e.newValue === "1"); };
    // Same tab, different component (the menu item): `storage` never fires in the tab that wrote
    // the value, so the toggle announces itself on this channel too.
    const onLocal = () => setHidden(readPrivacy());
    window.addEventListener("keydown", onKey);
    window.addEventListener("storage", onStorage);
    window.addEventListener(PRIVACY_EVENT, onLocal);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PRIVACY_EVENT, onLocal);
    };
  }, []);

  return (
    <div className={className}>
      {children}
      {/* Frosted layer over the ENTIRE viewport (nav + content + assistant). */}
      {hidden && (
        // The shield is its own "off" switch. The menu is UNDERNEATH this layer, so if the only
        // control lived there, turning the screen back on would be impossible with the mouse.
        <div className="privacy-overlay no-print fixed inset-0 z-[54] flex items-center justify-center">
          <div className="text-center select-none">
            <p className="mb-3 flex justify-center"><Icon g="🔒" className="w-12 h-12 text-ink" /></p>
            <p className="text-ink font-medium">{t(lang, "privacyHiddenMsg")}</p>
            <button onClick={() => set(false)}
              className="mt-4 px-6 py-2.5 rounded-full bg-ink text-white text-sm shadow-luxe hover:bg-ink/90 transition-colors">
              {t(lang, "privacyShow")}
            </button>
            <p className="text-xs text-muted mt-2">Ctrl/⌘ + Shift + H</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The menu entry that hides the screen — rendered by AdminNav, styled like every other nav row so
 * it reads as part of the menu instead of a control bolted onto the page.
 *
 * It reflects the live state (the keyboard shortcut and other tabs can change it), but in practice
 * it is only ever used to switch the shield ON: once the screen is hidden the menu is behind the
 * frosted layer, and the "Show screen" button on the shield itself is what brings it back.
 */
export function PrivacyToggle({ collapsed = false, lang = "en", onDone }: { collapsed?: boolean; lang?: Lang; onDone?: () => void }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readPrivacy());
    const sync = () => setHidden(readPrivacy());
    window.addEventListener(PRIVACY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(PRIVACY_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  const label = hidden ? t(lang, "privacyShow") : t(lang, "privacyHide");
  return (
    <button
      type="button"
      onClick={() => { const next = !readPrivacy(); setHidden(next); writePrivacy(next); onDone?.(); }}
      title={`${label} (Ctrl/⌘ + Shift + H)`}
      className={`group flex w-full items-center gap-3 rounded-xl text-sm text-cream/85 hover:bg-white/10 transition-all ${collapsed ? "justify-center py-2.5" : "px-3 py-2.5"}`}
    >
      <span className="w-5 flex justify-center text-gold-light shrink-0"><Icon g="🔒" className="w-[18px] h-[18px]" /></span>
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          <kbd className="ml-auto text-[9px] font-sans opacity-50 border border-white/30 rounded px-1 leading-none py-0.5">⌃⇧H</kbd>
        </>
      )}
    </button>
  );
}
