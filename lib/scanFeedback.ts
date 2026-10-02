/**
 * Counter feedback for scans, the way every serious POS does it: a short high "beep" when a
 * sticker lands on the bill and a low double "buzz" when it doesn't — so staff can keep their eyes
 * on the customer and the next piece instead of the screen. Web Audio only (no files to load);
 * silently does nothing where audio isn't available. Muting is remembered per counter.
 */
const MUTE_KEY = "aj_pos_scan_sound_off";
let ctx: AudioContext | null = null;

export function scanSoundEnabled(): boolean {
  try { return localStorage.getItem(MUTE_KEY) !== "1"; } catch { return true; }
}

export function setScanSoundEnabled(on: boolean): void {
  try { if (on) localStorage.removeItem(MUTE_KEY); else localStorage.setItem(MUTE_KEY, "1"); } catch { /* private mode */ }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function scanFeedback(kind: "ok" | "warn" | "error"): void {
  if (typeof window === "undefined" || !scanSoundEnabled()) return;
  try {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "ok") tone(1760, 0, 0.07, "sine");
    else if (kind === "warn") { tone(880, 0, 0.08, "triangle"); tone(660, 0.1, 0.1, "triangle"); }
    else { tone(220, 0, 0.12, "square", 0.05); tone(180, 0.16, 0.16, "square", 0.05); }
  } catch { /* audio blocked — the on-screen message still shows */ }
  try { if (kind === "error") navigator.vibrate?.([60, 40, 60]); } catch { /* not supported */ }
}
