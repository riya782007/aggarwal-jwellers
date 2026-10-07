import { describe, it, expect, afterEach } from "vitest";
import { isNativeApp, printLabelsNative, installNativePrintShim, listPrinters } from "@/lib/nativeBridge";

/** Guarantee: on a normal browser (counter PCs, owner's Chrome) the app code never activates,
 *  so Print labels keeps using the PDF path and window.print() is untouched. */
const g = globalThis as any;
afterEach(() => { delete g.window; delete g.localStorage; });

describe("website behaviour is unchanged outside the Android app", () => {
  it("server / no window → not native", () => {
    expect(isNativeApp()).toBe(false);
  });

  it("plain browser (no Capacitor) → not native, print untouched, no printing attempted", async () => {
    const print = () => "original";
    g.window = { print };
    g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    expect(isNativeApp()).toBe(false);
    installNativePrintShim();
    expect(g.window.print).toBe(print);
    expect(await listPrinters(true)).toEqual([]);
    expect(await printLabelsNative([{ sku: "X", qrValue: "X", showName: false, showSku: true }])).toBe(false);
  });

  it("Capacitor present but on the web platform → still not native", () => {
    g.window = { Capacitor: { isNativePlatform: () => false, Plugins: {} } };
    expect(isNativeApp()).toBe(false);
  });

  it("inside the Android app → native", () => {
    g.window = { Capacitor: { isNativePlatform: () => true, Plugins: { AjPrinter: {} } } };
    expect(isNativeApp()).toBe(true);
  });
});

import { downloadName, isDownloadLink } from "@/lib/nativeBridge";
const link = (href: string, download?: string) => ({
  href,
  hasAttribute: (n: string) => n === "download" && download !== undefined,
  getAttribute: (n: string) => (n === "download" ? download ?? null : n === "href" ? href : null),
});

describe("app downloads (exports / label PDFs / templates)", () => {
  it("only links with a download attribute count", () => {
    expect(isDownloadLink(link("blob:https://aggarwaljeweller.in/1234", "ledger.csv"))).toBe(true);
    expect(isDownloadLink(link("data:text/csv;charset=utf-8,a,b", "template.csv"))).toBe(true);
    expect(isDownloadLink(link("https://aggarwaljeweller.in/files/x.xlsx", ""))).toBe(true);
    expect(isDownloadLink(link("https://wa.me/919999999999?text=hi"))).toBe(false); // WhatsApp opens the app instead
    expect(isDownloadLink(link("javascript:void(0)", "x"))).toBe(false);
  });
  it("file name comes from the attribute, else the URL", () => {
    expect(downloadName(link("blob:https://x/1", "aggarwal-labels.pdf"))).toBe("aggarwal-labels.pdf");
    expect(downloadName(link("https://aggarwaljeweller.in/files/stock%20list.xlsx", ""))).toBe("stock list.xlsx");
    expect(downloadName(link("data:text/csv,a", ""))).toBe("aggarwal-export");
  });
});
