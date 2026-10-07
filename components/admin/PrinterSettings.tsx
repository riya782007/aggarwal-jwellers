"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getPrinterConfig, isNativeApp, listPrinters, savePrinterConfig, sendTspl,
  type PrinterConfig, type PrinterDevice,
} from "@/lib/nativeBridge";
import { buildTsplJob, DEFAULT_TSPL, testLabel } from "@/lib/tspl";

/** Printer names that are almost certainly label/receipt printers — listed first. */
const PRINTERISH = /print|label|pos|tsc|xprinter|seznik|tejas|z1300|gprinter|zebra|hprt|rongta|tvs|bt-?\d|mpt|thermal/i;

export function PrinterSettings({ setup }: { setup: boolean }) {
  const [native, setNative] = useState(false);
  const [cfg, setCfg] = useState<PrinterConfig | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (scan: boolean) => {
    setBusy(scan ? "Searching for printers nearby…" : "Loading paired devices…");
    setMsg(null);
    try {
      const list = await listPrinters(scan);
      list.sort((a, b) => Number(PRINTERISH.test(b.name)) - Number(PRINTERISH.test(a.name)) || a.name.localeCompare(b.name));
      setDevices(list);
      if (!list.length) setMsg({ ok: false, text: "No printer found. Switch the printer on, keep it near the phone, then tap “Find nearby printers”." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Couldn't read Bluetooth devices. Allow Bluetooth for the app and try again." });
    } finally { setBusy(null); }
  }, []);

  useEffect(() => {
    const n = isNativeApp();
    setNative(n);
    setCfg(getPrinterConfig());
    if (n) void load(false);
  }, [load]);

  async function test(c: PrinterConfig) {
    setBusy("Printing a test sticker…");
    setMsg(null);
    try {
      await sendTspl(buildTsplJob([testLabel(), testLabel()].slice(0, c.layout === "2up" ? 2 : 1), c), c);
      setMsg({ ok: true, text: "Test sticker sent. If the QR scans at the counter, you're done." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Printer not reachable." });
    } finally { setBusy(null); }
  }

  async function choose(d: PrinterDevice) {
    const c: PrinterConfig = { ...DEFAULT_TSPL, ...(cfg ?? {}), address: d.address, name: d.name || d.address, type: d.type };
    savePrinterConfig(c);
    setCfg(c);
    await test(c);
  }

  function update(patch: Partial<PrinterConfig>) {
    if (!cfg) return;
    const c = { ...cfg, ...patch };
    savePrinterConfig(c);
    setCfg(c);
  }

  async function raw(cmd: string, label: string) {
    if (!cfg) return;
    setBusy(label);
    setMsg(null);
    try { await sendTspl(cmd, cfg); setMsg({ ok: true, text: "Done." }); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || "Printer not reachable." }); }
    finally { setBusy(null); }
  }

  if (!native) {
    return (
      <div className="max-w-xl rounded-2xl bg-white border border-sand p-5 text-sm text-ink">
        <p className="font-medium mb-2">Bluetooth printing works in the Aggarwal Android app.</p>
        <p className="text-muted">On this computer, keep using <b>Print labels</b> as before — it prints through the PC's label printer (USB). Nothing to set up here.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      {setup && !cfg && (
        <div className="rounded-xl bg-gold/15 border border-gold/40 p-3 text-sm text-ink">Pick your printer below once — then go back and tap Print again.</div>
      )}

      {cfg && (
        <div className="rounded-2xl bg-white border border-sand p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Connected printer</p>
          <p className="text-lg font-medium text-ink">{cfg.name}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button disabled={!!busy} onClick={() => test(cfg)} className="btn-primary px-4 py-2 text-sm">Print test sticker</button>
            <button disabled={!!busy} onClick={() => raw("GAPDETECT\r\n", "Measuring the sticker roll…")} className="px-4 py-2 text-sm rounded-lg bg-white border border-sand">Calibrate roll</button>
            <button disabled={!!busy} onClick={() => { savePrinterConfig(null); setCfg(null); }} className="px-4 py-2 text-sm rounded-lg bg-white border border-sand">Forget</button>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">Advanced (only if stickers look wrong)</summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="flex flex-col gap-1">Printer sharpness
                <select value={cfg.dpmm} onChange={(e) => update({ dpmm: Number(e.target.value) === 8 ? 8 : 12 })} className="border border-sand rounded-lg px-2 py-1.5">
                  <option value={12}>300 / 304 dpi</option><option value={8}>203 dpi</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">Sticker roll
                <select value={cfg.layout} onChange={(e) => update({ layout: e.target.value === "1up" ? "1up" : "2up" })} className="border border-sand rounded-lg px-2 py-1.5">
                  <option value="2up">4-inch roll, 2 stickers across</option><option value="1up">2-inch roll, 1 sticker</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">Gap between stickers (mm)
                <input type="number" min={0} max={10} step={0.5} value={cfg.gapMm ?? 2} onChange={(e) => update({ gapMm: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} className="border border-sand rounded-lg px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">Darkness (0–15)
                <input type="number" min={0} max={15} value={cfg.density ?? 10} onChange={(e) => update({ density: Math.max(0, Math.min(15, Math.round(Number(e.target.value) || 0))) })} className="border border-sand rounded-lg px-2 py-1.5" />
              </label>
            </div>
          </details>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-sand p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="font-medium text-ink">{cfg ? "Change printer" : "Choose your printer"}</p>
          <button disabled={!!busy} onClick={() => load(true)} className="px-3 py-1.5 text-sm rounded-lg bg-white border border-sand">Find nearby printers</button>
        </div>
        <ul className="divide-y divide-sand">
          {devices.map((d) => (
            <li key={d.address}>
              <button disabled={!!busy} onClick={() => choose(d)} className="w-full text-left py-3 flex items-center justify-between gap-3">
                <span>
                  <span className="block text-ink">{d.name || "Unnamed device"}</span>
                  <span className="block text-xs text-muted">{d.address}{d.bonded ? " · paired" : ""}</span>
                </span>
                <span className="text-sm text-emerald">{cfg?.address === d.address ? "✓ In use" : "Use"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {busy && <p className="text-sm text-muted">{busy}</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
