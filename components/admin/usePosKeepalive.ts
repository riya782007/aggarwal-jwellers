"use client";
import { useEffect } from "react";

/**
 * While Billing / Estimates is open, ping a tiny admin route every few minutes.
 * That (1) slides the 1-hour session cookie — server actions on Netlify do not always
 * hit middleware, so a counter that only scans would otherwise get logged out — and
 * (2) keeps the serverless function warm so the first QR after a quiet spell does not 503.
 */
const PING_MS = 2 * 60 * 1000;

export function usePosKeepalive() {
  useEffect(() => {
    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch("/admin/pos-ping", { cache: "no-store", credentials: "same-origin" }).catch(() => { /* next interval retries */ });
    };
    ping();
    const id = window.setInterval(ping, PING_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
