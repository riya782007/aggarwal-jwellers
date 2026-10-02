/**
 * USB / Bluetooth HID keyboard-wedge tracker (the Square / Toast / Lightspeed pattern).
 *
 * Counter scanners dump a SKU as a burst of keystrokes (~5–20 ms apart) then Enter.
 * Humans type much slower. When a burst + terminator arrives — even if focus is on a
 * qty stepper or the Complete button — treat it as a scan instead of a click/typo.
 *
 * Field lessons baked in:
 *  - Bluetooth scanners (and a busy USB hub) sometimes stall 60–120 ms mid-code. Once a burst is
 *    clearly a machine (HID_ESTABLISHED_CHARS chars all ≤ HID_MAX_GAP_MS apart) a longer gap is
 *    tolerated, so "AJDH1931" no longer arrives as "H1931" → "No product".
 *  - Some scanners are set up with no Enter/Tab suffix. A clean machine burst that then goes quiet
 *    for HID_IDLE_COMMIT_MS is committed on its own (see `idle()`), so those still bill.
 */

export const HID_MAX_GAP_MS = 50;
/** Gap tolerated once a burst is unmistakably a scanner. Humans can't sustain the lead-in. */
export const HID_BURST_GAP_MS = 150;
export const HID_ESTABLISHED_CHARS = 4;
export const HID_MIN_CHARS = 3;
/** Suffix-less scanners: commit a strict burst after this much silence. Must exceed
 *  HID_BURST_GAP_MS, or a scanner that stalls mid-code would be committed half-read. */
export const HID_IDLE_COMMIT_MS = 200;
export const HID_IDLE_MIN_CHARS = 6;

export type HidKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  timeStamp: number;
};

export type HidResult =
  | { kind: "char"; consume: boolean; first: boolean }
  | { kind: "commit"; payload: string }
  | { kind: "ignore" };

export class HidScanBuffer {
  private buf = "";
  private last = 0;
  /** every gap so far ≤ HID_MAX_GAP_MS — a pure machine burst */
  private strict = true;

  reset() {
    this.buf = "";
    this.last = 0;
    this.strict = true;
  }

  /** True once the burst can only have come from a scanner. */
  private get established() {
    return this.buf.length >= HID_ESTABLISHED_CHARS;
  }

  push(e: HidKey): HidResult {
    if (e.ctrlKey || e.metaKey || e.altKey) return { kind: "ignore" };
    if (e.key === "Shift" || e.key === "Process" || e.key === "Unidentified" || e.key === "CapsLock") return { kind: "ignore" };

    const t = e.timeStamp || 0;
    const gap = this.buf ? t - this.last : Infinity;
    const limit = this.established ? HID_BURST_GAP_MS : HID_MAX_GAP_MS;
    if (this.buf && gap > limit) this.reset();

    if (e.key === "Enter" || e.key === "Tab") {
      const payload = this.buf;
      this.reset();
      if (payload.length >= HID_MIN_CHARS) return { kind: "commit", payload };
      return { kind: "ignore" };
    }

    if (e.key === "Backspace" || e.key === "Escape") {
      this.reset();
      return { kind: "ignore" };
    }

    if (e.key.length === 1) {
      if (this.buf && gap > HID_MAX_GAP_MS) this.strict = false;
      this.last = t;
      this.buf += e.key;
      return { kind: "char", consume: this.buf.length >= 2, first: this.buf.length === 1 };
    }

    return { kind: "ignore" };
  }

  /**
   * Call after HID_IDLE_COMMIT_MS of silence. Commits a suffix-less scan only when the whole burst
   * was machine-fast and long enough that no human could have typed it.
   */
  idle(now: number): HidResult {
    if (!this.buf || now - this.last < HID_IDLE_COMMIT_MS) return { kind: "ignore" };
    const payload = this.buf;
    const ok = this.strict && payload.length >= HID_IDLE_MIN_CHARS;
    this.reset();
    return ok ? { kind: "commit", payload } : { kind: "ignore" };
  }
}
