"use client";
import { useEffect, useRef } from "react";
import { HidScanBuffer, HID_IDLE_COMMIT_MS } from "@/lib/hidScan";

/** After a suffix-less (idle) commit, a late Enter from the same scan must not submit it again. */
const LATE_ENTER_SWALLOW_MS = 1200;

/** Put a field back to `value` the way React notices (controlled inputs ignore a bare .value=). */
function restoreFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  if (el.value === value) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Capture USB wedge / 2D scanner bursts at the window (capture phase) so a scan still
 * adds the piece when focus is on qty, rate, payment, or the complete button — the usual
 * rush-hour miss. Human typing in the search box is left alone (gaps > 50 ms).
 *
 * The first character of a burst can't be told apart from a keypress until the second one
 * arrives, so it lands in whatever field has focus (a qty box, the rate box — a "5" there is a
 * ₹5 rate). When the burst turns out to be a scan, that field is put back as it was.
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
    let idleTimer: number | undefined;
    let swallowEnterUntil = 0;
    // The field the burst's first character fell into, and what it held before.
    let leak: { el: HTMLInputElement | HTMLTextAreaElement; before: string } | null = null;

    const commit = (payload: string) => {
      const scanEl = scanInputRef.current;
      if (leak && leak.el !== scanEl && leak.el.isConnected) restoreFieldValue(leak.el, leak.before);
      leak = null;
      onScanRef.current(payload);
    };

    const onKey = (e: KeyboardEvent) => {
      if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = undefined; }
      if ((e.key === "Enter" || e.key === "Tab") && Date.now() < swallowEnterUntil) {
        swallowEnterUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        bufRef.current.reset();
        return;
      }
      const r = bufRef.current.push(e);
      if (r.kind === "commit") {
        e.preventDefault();
        e.stopPropagation();
        commit(r.payload);
        return;
      }
      if (r.kind !== "char") return;
      const target = e.target as HTMLElement | null;
      const scanEl = scanInputRef.current;
      if (r.first) {
        leak = target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target !== scanEl
          ? { el: target, before: target.value }
          : null;
      }
      if (r.consume && (!scanEl || target !== scanEl)) e.preventDefault();
      idleTimer = window.setTimeout(() => {
        idleTimer = undefined;
        const res = bufRef.current.idle(performance.now());
        if (res.kind === "commit") {
          swallowEnterUntil = Date.now() + LATE_ENTER_SWALLOW_MS;
          commit(res.payload);
        } else {
          leak = null;
        }
      }, HID_IDLE_COMMIT_MS + 10);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, scanInputRef]);
}
