"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the owner console LIVE without manual refreshes.
 *
 * Next.js only re-renders a page on navigation or an explicit router.refresh(). That leaves gaps
 * where a change you (or another staff member) just made isn't reflected until you hit F5. This
 * closes every gap by SOFT-refreshing the current route — server components re-fetch and merge,
 * while your typed input, the POS cart, and other client state are preserved (router.refresh does
 * not remount client components). It refreshes:
 *   • the instant you switch back to this tab / window (focus + visibilitychange), and
 *   • on a light interval while the tab is visible — skipped while typing, while a POS
 *     bill is open (`data-no-autorefresh`), and for 2.5s after any click/key so rush-hour
 *     taps are never stolen by a background refresh.
 */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const cooling = useRef(false);

  useEffect(() => {
    const lastInteract = { current: 0 };
    const bumpInteract = () => { lastInteract.current = Date.now(); };
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
    };
    const posLive = () => !!document.querySelector("[data-no-autorefresh]");
    const softRefresh = () => {
      if (document.visibilityState !== "visible" || cooling.current) return;
      if (posLive()) return;
      if (Date.now() - lastInteract.current < 2500) return;
      cooling.current = true;
      router.refresh();
      window.setTimeout(() => { cooling.current = false; }, 1500);
    };
    const onVisible = () => { if (document.visibilityState === "visible") softRefresh(); };

    window.addEventListener("pointerdown", bumpInteract, { passive: true });
    window.addEventListener("keydown", bumpInteract, { passive: true });
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => { if (!isTyping() && !posLive()) softRefresh(); }, Math.max(2000, intervalMs));

    return () => {
      window.removeEventListener("pointerdown", bumpInteract);
      window.removeEventListener("keydown", bumpInteract);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [router, intervalMs]);

  return null;
}
