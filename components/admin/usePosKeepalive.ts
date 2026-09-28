"use client";
import { useEffect, useRef } from "react";

/**
 * While Billing / Estimates is open, ping a tiny admin route every few minutes.
 * That (1) slides the 1-hour session cookie — server actions on Netlify do not always
 * hit middleware, so a counter that only scans would otherwise get logged out — and
 * (2) keeps the serverless function warm so the first QR after a quiet spell does not 503.
 *
 * Pass `onStock` (Billing does) to also receive live `{ SKU: qty }` counts on the same ping,
 * so a POS left open all day doesn't keep showing the stock it loaded in the morning. The
 * very first ping skips stock — the page was just rendered with fresh numbers.
 */
const PING_MS = 2 * 60 * 1000;
const STOCK_MIN_GAP_MS = 30 * 1000;

export function usePosKeepalive(onStock?: (stock: Record<string, number>) => void) {
  const onStockRef = useRef(onStock);
  onStockRef.current = onStock;
  const wantsStock = !!onStock;

  useEffect(() => {
    // Stock is fetched at most once per 30s — flicking between tabs only sends the plain ping.
    let lastStockAt = Date.now();
    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const withStock = wantsStock && Date.now() - lastStockAt >= STOCK_MIN_GAP_MS;
      if (withStock) lastStockAt = Date.now();
      fetch(withStock ? "/admin/pos-ping?stock=1" : "/admin/pos-ping", { cache: "no-store", credentials: "same-origin" })
        .then(async (res) => {
          if (!withStock || !res.ok) return;
          // A logged-out session is redirected to the /login HTML — ignore anything that isn't JSON.
          if (!(res.headers.get("content-type") ?? "").includes("application/json")) return;
          const body = await res.json().catch(() => null);
          const stock = body?.stock;
          if (stock && typeof stock === "object") onStockRef.current?.(stock as Record<string, number>);
        })
        .catch(() => { /* next interval retries */ });
    };
    ping();
    const id = window.setInterval(ping, PING_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wantsStock]);
}
