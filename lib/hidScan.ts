/**
 * USB HID keyboard-wedge tracker (the Square / Toast / Lightspeed pattern).
 *
 * Counter scanners dump a SKU as a burst of keystrokes (~5–20 ms apart) then Enter.
 * Humans type much slower. When a burst + terminator arrives — even if focus is on a
 * qty stepper or the Complete button — treat it as a scan instead of a click/typo.
 */

export const HID_MAX_GAP_MS = 50;
export const HID_MIN_CHARS = 3;

export type HidKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  timeStamp: number;
};

export type HidResult =
  | { kind: "char"; consume: boolean }
  | { kind: "commit"; payload: string }
  | { kind: "ignore" };

export class HidScanBuffer {
  private buf = "";
  private last = 0;
  private burst = true;

  reset() {
    this.buf = "";
    this.last = 0;
    this.burst = true;
  }

  push(e: HidKey): HidResult {
    if (e.ctrlKey || e.metaKey || e.altKey) return { kind: "ignore" };
    if (e.key === "Shift" || e.key === "Process" || e.key === "Unidentified") return { kind: "ignore" };

    const t = e.timeStamp || 0;
    const gap = this.last ? t - this.last : Infinity;
    if (this.last && gap > HID_MAX_GAP_MS) {
      this.buf = "";
      this.burst = true;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      const payload = this.buf;
      const burst = this.burst && payload.length >= HID_MIN_CHARS;
      this.reset();
      if (burst) return { kind: "commit", payload };
      return { kind: "ignore" };
    }

    if (e.key === "Backspace" || e.key === "Escape") {
      this.reset();
      return { kind: "ignore" };
    }

    if (e.key.length === 1) {
      this.last = t;
      if (gap <= HID_MAX_GAP_MS) this.burst = this.burst && true;
      this.buf += e.key;
      const consume = this.burst && this.buf.length >= 2;
      return { kind: "char", consume };
    }

    return { kind: "ignore" };
  }
}
