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
  saveFile(o: { name: string; mime: string; data: string; share?: boolean }): Promise<{ savedTo?: string | null }>;
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
  installNativeDownloads(p);
}

/** File name for a download link: its `download` attribute, else the last URL segment. */
export function downloadName(a: { getAttribute(n: string): string | null; href: string }): string {
  const given = (a.getAttribute("download") || "").trim();
  if (given) return given;
  try {
    const u = new URL(a.href);
    if (u.protocol === "http:" || u.protocol === "https:") {
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) return decodeURIComponent(last);
    }
  } catch { /* unparsable */ }
  return "aggarwal-export";
}

/** True for links the browser would download (has a `download` attribute and a real target). */
export function isDownloadLink(a: { hasAttribute(n: string): boolean; getAttribute(n: string): string | null; href: string }): boolean {
  if (!a.hasAttribute("download")) return false;
  const href = a.href || a.getAttribute("href") || "";
  return /^(blob:|data:|https?:)/i.test(href);
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/**
 * Android apps have no browser "download". Excel / CSV exports, label PDFs and template files
 * are links with a `download` attribute (often a blob: URL revoked right after the click), so the
 * file is captured AT CLICK TIME and handed to the native side, which saves it to
 * Downloads/Aggarwal and opens the share sheet (WhatsApp, Drive, print…).
 */
function installNativeDownloads(p: AjPrinterPlugin): void {
  const take = (a: HTMLAnchorElement): boolean => {
    if (!isDownloadLink(a)) return false;
    const name = downloadName(a);
    // Start reading synchronously — the page may revoke a blob: URL right after click().
    const read = fetch(a.href).then((r) => r.blob());
    read
      .then(async (b) => p.saveFile({ name, mime: b.type || "application/octet-stream", data: await blobToBase64(b) }))
      .catch(() => alert(`Couldn't save ${name}. Try again, or export it from the counter PC.`));
    return true;
  };
  const proto = HTMLAnchorElement.prototype;
  const origClick = proto.click;
  proto.click = function (this: HTMLAnchorElement) { if (take(this)) return; return origClick.call(this); };
  const origDispatch = proto.dispatchEvent;
  proto.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
    if (ev?.type === "click" && take(this)) return false;
    return origDispatch.call(this, ev);
  };
  // Links tapped by hand (e.g. "Download a ready-made template").
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
    if (a && take(a)) e.preventDefault();
  }, true);
}
