"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Phone / tablet camera scanner for the counter — and the backup when a USB scanner is
 * unplugged or flaky. Uses the browser's native BarcodeDetector (Chrome on Android, Edge) and
 * falls back to jsQR, loaded only when the camera opens so billing stays light.
 *
 * Continuous: keep pointing at stickers and each new one goes on the bill. The same code is
 * ignored for REPEAT_MS so a sticker held in view doesn't add itself again and again.
 */
const REPEAT_MS = 1500;
const FRAME_MS = 120;
const MAX_SIDE = 720;

type Detect = (src: HTMLCanvasElement) => Promise<string | null>;

async function makeDetector(): Promise<Detect> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const formats: string[] = (await BD.getSupportedFormats?.()) ?? [];
      if (!formats.length || formats.includes("qr_code")) {
        const wanted = ["qr_code", "code_128", "code_39", "ean_13"].filter((f) => !formats.length || formats.includes(f));
        const det = new BD({ formats: wanted });
        return async (c) => {
          const found = await det.detect(c);
          return found?.[0]?.rawValue ?? null;
        };
      }
    } catch { /* fall through to jsQR */ }
  }
  const jsQR = (await import("jsqr")).default;
  return async (c) => {
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    const img = g.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
  };
}

export function CameraScanner({ onScan, onClose }: { onScan: (raw: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [status, setStatus] = useState("Starting camera…");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    const last = { code: "", at: 0 };
    const canvas = document.createElement("canvas");

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera here (needs HTTPS).");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const detect = await makeDetector();
        setStatus("Point at a sticker");
        const tick = async () => {
          if (stopped) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && v.videoWidth) {
            const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            canvas.getContext("2d", { willReadFrequently: true })?.drawImage(v, 0, 0, canvas.width, canvas.height);
            try {
              const code = (await detect(canvas))?.trim();
              const now = Date.now();
              if (code && !(code === last.code && now - last.at < REPEAT_MS)) {
                last.code = code;
                onScanRef.current(code);
                setFlash(true);
                window.setTimeout(() => setFlash(false), 250);
              }
              if (code) last.at = now; // still in view → keep it suppressed
            } catch { /* one bad frame — keep going */ }
          }
          timer = window.setTimeout(tick, FRAME_MS);
        };
        void tick();
      } catch (err: any) {
        setStatus(err?.name === "NotAllowedError" ? "Camera permission was denied — allow it in the browser and reopen." : err?.message || "Camera unavailable.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4" role="dialog" aria-label="Camera scanner">
      <div className="bg-white rounded-2xl shadow-luxe w-full max-w-md overflow-hidden">
        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <div className={`pointer-events-none absolute inset-[18%] rounded-xl border-4 transition-colors ${flash ? "border-emerald" : "border-white/70"}`} />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted">{status}</p>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-ink text-white text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
