"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installNativePrintShim, isNativeApp } from "@/lib/nativeBridge";

const SEEN_KEY = "aj_device_seen";
const DEDUPE_MS = 10 * 60 * 1000;

/**
 * Mounted once in the admin layout. Renders nothing.
 * 1. In the Android app, window.print() opens Android's print screen (A4 bills keep working).
 * 2. Records phone / PC usage per screen (at most once per screen per 10 min per tab), so the
 *    owner can see which devices the shop actually uses. Fire-and-forget; never blocks.
 */
export function NativeAppBridge() {
  const path = usePathname();
  useEffect(() => { installNativePrintShim(); }, []);
  useEffect(() => {
    if (!path) return;
    try {
      const seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
      const now = Date.now();
      if (seen[path] && now - seen[path] < DEDUPE_MS) return;
      seen[path] = now;
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch { /* private mode: still send */ }
    const body = JSON.stringify({ path, app: isNativeApp() });
    try {
      fetch("/admin/device-ping", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" } }).catch(() => {});
    } catch { /* */ }
  }, [path]);
  return null;
}
