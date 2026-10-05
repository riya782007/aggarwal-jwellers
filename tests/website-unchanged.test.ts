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
