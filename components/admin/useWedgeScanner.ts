"use client";
import { useEffect, useRef } from "react";
import { HidScanBuffer } from "@/lib/hidScan";

/**
 * Capture USB wedge / 2D scanner bursts at the window (capture phase) so a scan still
 * adds the piece when focus is on qty, payment, or the complete button — the usual
 * rush-hour miss. Human typing in the search box is left alone (gaps > 50 ms).
 */
export function useWedgeScanner(
  onScan: (raw: string) => void,
  scanInputRef: React.RefObject<HTMLInputElement | null>,
  enabled = true,
) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const bufRef = useRef(new HidScanBuffer());

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const r = bufRef.current.push(e);
      if (r.kind === "commit") {
        e.preventDefault();
        e.stopPropagation();
        onScanRef.current(r.payload);
        return;
      }
      if (r.kind === "char" && r.consume) {
        const target = e.target as HTMLElement | null;
        const scanEl = scanInputRef.current;
        if (!scanEl || target !== scanEl) e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, scanInputRef]);
}
