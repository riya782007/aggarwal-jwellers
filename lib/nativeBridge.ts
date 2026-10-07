/**
 * lib/nativeBridge.ts — talks to the Aggarwal Android app's native "AjPrinter" plugin.
 *
 * The Android app is a Capacitor shell that loads this same website. Capacitor injects
 * `window.Capacitor` into the page, so no npm package is needed here and NOTHING changes on a
 * normal browser: every function checks isNativeApp() first and the website keeps its PDF path.
 */
import { buildTsplJob, DEFAULT_TSPL, type TsplOptions } from "@/lib/tspl";
import type { PdfLabel } from "@/lib/labelPdf";

export type PrinterDevice = { name: string; address: string; type: "classic" | "le" | "dual" | "unknown"; bonded: boolean };
export type PrinterConfig = TsplOptions & { address: string; name: string; type: PrinterDevice["type"] };

type AjPrinterPlugin = {
  listDevices(o: { scan: boolean }): Promise<{ devices: PrinterDevice[] }>;
  write(o: { address: string; type: string; data: string }): Promise<void>;
  printPage(o: { name: string }): Promise<void>;
  disconnect(): Promise<void>;
};

const KEY = "aj_printer";

function cap(): any {
  return typeof window === "undefined" ? null : (window as any).Capacitor;
}

/** True only inside the Aggarwal Android app. */
export function isNativeApp(): boolean {
  try { return Boolean(cap()?.isNativePlatform?.()); } catch { return false; }
}

function plugin(): AjPrinterPlugin | null {
  if (!isNativeApp()) return null;
  return (cap()?.Plugins?.AjPrinter as AjPrinterPlugin) ?? null;
}

export function getPrinterConfig(): PrinterConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.address ? { ...DEFAULT_TSPL, ...c } : null;
  } catch { return null; }
}

export function savePrinterConfig(c: PrinterConfig | null): void {
  try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch { /* */ }
}

export async function listPrinters(scan: boolean): Promise<PrinterDevice[]> {
  const p = plugin();
  if (!p) return [];
  const { devices } = await p.listDevices({ scan });
  return devices ?? [];
}

/** Friendly wording for the counter — never a stack trace. */
function friendly(err: any): Error {
  const msg = String(err?.message ?? err ?? "");
  if (/permission/i.test(msg)) return new Error("Allow Bluetooth for the Aggarwal app (Settings → Apps → Aggarwal → Permissions), then tap Print again.");
  if (/off|disabled|adapter/i.test(msg)) return new Error("Bluetooth is off. Turn it on and tap Print again.");
  return new Error("Printer not reachable. Switch it on, keep the phone near it, and tap Print again.");
}

export async function sendTspl(job: string, cfg: PrinterConfig): Promise<void> {
  const p = plugin();
  if (!p) throw new Error("Printing over Bluetooth works in the Aggarwal app.");
  try {
    await p.write({ address: cfg.address, type: cfg.type, data: job });
  } catch (first) {
    // One silent retry: a sleeping printer often drops the first connection.
    try { await p.disconnect(); await p.write({ address: cfg.address, type: cfg.type, data: job }); }
    catch { throw friendly(first); }
  }
}

/**
 * Print labels on the paired Bluetooth printer.
 * Returns false when no printer is set up yet (caller sends staff to the printer screen).
 */
export async function printLabelsNative(labels: PdfLabel[]): Promise<boolean> {
  const cfg = getPrinterConfig();
  if (!cfg) return false;
  await sendTspl(buildTsplJob(labels, cfg), cfg);
  return true;
}

/** Inside the app, window.print() opens Android's print screen for the current page (A4 bills). */
export function installNativePrintShim(): void {
  const p = plugin();
  if (!p || (window as any).__ajPrintShim) return;
  (window as any).__ajPrintShim = true;
  window.print = () => {
    p.printPage({ name: document.title || "Aggarwal Jewellers" }).catch(() => {
      alert("Couldn't open the print screen. Try again, or print this page from the counter PC.");
    });
  };
}
