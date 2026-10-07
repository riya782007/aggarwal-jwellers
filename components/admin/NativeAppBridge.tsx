"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installNativePrintShim, isNativeApp } from "@/lib/nativeBridge";

const SEEN_KEY = "aj_device_seen_at";
/** One usage ping per device per 6 hours — enough to answer "phone or PC?", and each ping is a
 *  paid serverless call, so a busy counter must not send one per screen. */
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Mounted once in the admin layout. Renders nothing.
 * 1. In the Android app: window.print() opens Android's print screen (A4 bills) and download
 *    links (Excel/CSV exports, label PDFs) are saved to the phone — see lib/nativeBridge.
 * 2. Records which kind of device uses the console (phone / tablet / PC, app or browser) at most
 *    once per device every 6 hours. Fire-and-forget; never blocks.
 */
export function NativeAppBridge() {
  const path = usePathname();
  useEffect(() => { installNativePrintShim(); }, []);
  useEffect(() => {
    if (!path) return;
    try {
      const last = Number(localStorage.getItem(SEEN_KEY) || 0);
      if (Date.now() - last < EVERY_MS) return;
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch { return; /* no storage → skip rather than ping on every screen */ }
    const body = JSON.stringify({ path, app: isNativeApp() });
    try {
      fetch("/admin/device-ping", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" } }).catch(() => {});
    } catch { /* */ }
  }, [path]);
  return null;
}
