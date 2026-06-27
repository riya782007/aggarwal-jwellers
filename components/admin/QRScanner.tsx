"use client";
import { useEffect, useRef, useState } from "react";

/**
 * In-browser QR scanner using the native BarcodeDetector API (Chrome/Android/Edge).
 * Pure progressive enhancement: if the API or camera is unavailable, it degrades to a
 * clear message + manual SKU entry, so nothing ever breaks. Handy for verifying that a
 * freshly-printed Aggarwal QR label actually scans before a big print run, and for POS.
 */
export function QRScanner({ onResult }: { onResult?: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [last, setLast] = useState("");
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    const ok = typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
    setSupported(ok);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    runningRef.current = false;
    setActive(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      runningRef.current = true;
      setActive(true);
      const tick = async () => {
        if (!runningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) {
            const v = String(codes[0].rawValue || "");
            if (v && v !== last) { setLast(v); onResult?.(v); }
          }
        } catch { /* transient detect errors are fine */ }
        if (runningRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setErr("Couldn't access the camera. Check browser permissions, or type the SKU below.");
      stop();
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-card">
      <h2 className="font-medium text-ink mb-1">Scan a QR</h2>
      <p className="text-sm text-muted mb-3">Point your camera at a printed label to confirm it scans, or to look a product up.</p>

      {supported === false && (
        <p className="text-xs text-rose mb-3">This browser has no built-in QR camera. It works in Chrome on Android/desktop — meanwhile you can type the SKU below.</p>
      )}

      <div className="rounded-xl overflow-hidden bg-ink/5 aspect-video max-w-sm mb-3" style={{ display: active ? "block" : "none" }}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {supported && !active && <button onClick={start} className="btn-primary px-5 py-2 text-sm">Start camera</button>}
        {active && <button onClick={stop} className="px-5 py-2 text-sm rounded-full border border-sand hover:border-rose">Stop</button>}
        <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { setLast(manual.trim()); onResult?.(manual.trim().toUpperCase()); } }} className="flex items-center gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type a SKU" className="rounded-xl border border-sand px-3 py-2 text-sm outline-none focus:border-emerald" />
          <button className="px-4 py-2 text-sm rounded-full border border-sand hover:border-emerald">Look up</button>
        </form>
      </div>

      {err && <p className="text-xs text-rose mt-3">{err}</p>}
      {last && <p className="text-sm text-emerald mt-3">Scanned: <span className="font-mono">{last}</span> ✓</p>}
    </div>
  );
}
