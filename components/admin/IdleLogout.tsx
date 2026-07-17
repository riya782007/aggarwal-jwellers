"use client";
import { useEffect } from "react";

/**
 * Auto sign-out after 60 minutes of INACTIVITY on a shared shop-counter machine.
 * Any mouse/keyboard/touch/scroll activity resets the timer; the last-active time is shared
 * across tabs via localStorage so switching tabs doesn't reset it. When the idle limit is
 * reached (or on return to a tab that's been idle too long), it redirects to the server logout
 * route, which clears the cookies. The middleware also expires the cookie server-side after the
 * same window, so this is belt-and-suspenders — the screen won't sit open on customer data.
 */
const IDLE_MS = 60 * 60 * 1000; // 60 minutes
const KEY = "aj_last_active";

export function IdleLogout() {
  useEffect(() => {
    const now = () => Date.now();
    const stamp = () => { try { localStorage.setItem(KEY, String(now())); } catch {} };
    const last = () => { try { return Number(localStorage.getItem(KEY)) || now(); } catch { return now(); } };

    stamp(); // mark active on mount

    const bump = () => stamp();
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    // passive listeners so we never affect scrolling performance
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const check = () => {
      if (now() - last() >= IDLE_MS) {
        window.location.href = "/api/logout?reason=idle";
      }
    };
    const iv = window.setInterval(check, 30 * 1000); // check every 30s
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return null;
}
