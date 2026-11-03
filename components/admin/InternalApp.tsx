"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativeBridge";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InternalApp() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (isNativeApp()) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIos(!standalone && /iPad|iPhone|iPod/.test(navigator.userAgent));
    const update = () => setOffline(!navigator.onLine);
    const offer = (event: Event) => { if (!standalone) { event.preventDefault(); setInstall(event as InstallEvent); } };
    const installed = () => { setInstall(null); setIos(false); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/internal-sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* Browser access still works. */ });
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  async function installApp() {
    if (!install) return;
    try { await install.prompt(); await install.userChoice; } finally { setInstall(null); }
  }
  if (!offline && (dismissed || (!install && !ios))) return null;
  return <div className="no-print fixed bottom-3 inset-x-3 z-50 mx-auto max-w-md rounded-lg border bg-white p-3 shadow-lg text-sm" role="status">
    {offline ? <p>No connection. Reconnect before saving. Check the saved list before retrying a submission.</p> : <>
      {install ? <button type="button" className="min-h-11 rounded bg-ink text-white px-4" onClick={() => void installApp()}>Install staff app</button> : <p>To install: open this page in Safari, tap Share, then Add to Home Screen.</p>}
      <button type="button" className="min-h-11 px-4" onClick={() => setDismissed(true)}>Dismiss</button>
    </>}
  </div>;
}
