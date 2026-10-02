import { describe, expect, it } from "vitest";
import { HidScanBuffer, HID_MAX_GAP_MS } from "../lib/hidScan";

function typeBurst(buf: HidScanBuffer, text: string, start = 1000, gap = 12) {
  let t = start;
  const results = [];
  for (const ch of text) {
    results.push(buf.push({ key: ch, timeStamp: t }));
    t += gap;
  }
  results.push(buf.push({ key: "Enter", timeStamp: t }));
  return results;
}

describe("HID wedge scan buffer", () => {
  it("commits a fast SKU burst + Enter as one scan", () => {
    const buf = new HidScanBuffer();
    const results = typeBurst(buf, "AJ1004-RED");
    const commit = results.find((r) => r.kind === "commit");
    expect(commit).toEqual({ kind: "commit", payload: "AJ1004-RED" });
  });

  it("does not treat slow human typing as a scan", () => {
    const buf = new HidScanBuffer();
    let t = 0;
    for (const ch of "AJ1004") {
      buf.push({ key: ch, timeStamp: t });
      t += HID_MAX_GAP_MS + 40;
    }
    expect(buf.push({ key: "Enter", timeStamp: t })).toEqual({ kind: "ignore" });
  });

  it("starts a new scan after a pause so a second QR is not glued to the first", () => {
    const buf = new HidScanBuffer();
    typeBurst(buf, "AJ1004", 0, 10);
    const second = typeBurst(buf, "KPC64-MEH", 5000, 10);
    expect(second.at(-1)).toEqual({ kind: "commit", payload: "KPC64-MEH" });
  });
});

describe("HID wedge field resilience", () => {
  it("keeps a scan whole when a Bluetooth scanner stalls mid-code", () => {
    const buf = new HidScanBuffer();
    let t = 1000;
    for (const ch of "AJDH") { buf.push({ key: ch, timeStamp: t }); t += 10; }
    t += 110; // radio hiccup — well past the 50 ms human/machine threshold
    for (const ch of "1931") { buf.push({ key: ch, timeStamp: t }); t += 10; }
    expect(buf.push({ key: "Enter", timeStamp: t })).toEqual({ kind: "commit", payload: "AJDH1931" });
  });

  it("does not stretch the gap for a burst that was never machine-fast", () => {
    const buf = new HidScanBuffer();
    buf.push({ key: "A", timeStamp: 0 });
    buf.push({ key: "J", timeStamp: 30 });
    buf.push({ key: "1", timeStamp: 150 }); // > 50 ms before the burst was established → new burst
    buf.push({ key: "0", timeStamp: 160 });
    buf.push({ key: "0", timeStamp: 170 });
    expect(buf.push({ key: "Enter", timeStamp: 180 })).toEqual({ kind: "commit", payload: "100" });
  });

  it("commits a suffix-less scanner burst after it goes quiet", () => {
    const buf = new HidScanBuffer();
    let t = 0;
    for (const ch of "AJDH1931") { buf.push({ key: ch, timeStamp: t }); t += 8; }
    expect(buf.idle(t + 20)).toEqual({ kind: "ignore" }); // not quiet long enough yet
    expect(buf.idle(t + 300)).toEqual({ kind: "commit", payload: "AJDH1931" });
  });

  it("never idle-commits human typing or a short burst", () => {
    const buf = new HidScanBuffer();
    let t = 0;
    for (const ch of "AJ10") { buf.push({ key: ch, timeStamp: t }); t += 8; }
    expect(buf.idle(t + 500)).toEqual({ kind: "ignore" });
    const human = new HidScanBuffer();
    t = 0;
    for (const ch of "Kundan necklace") { human.push({ key: ch, timeStamp: t }); t += 140; }
    expect(human.idle(t + 500)).toEqual({ kind: "ignore" });
  });

  it("flags only the first character of a burst as possibly leaked into a field", () => {
    const buf = new HidScanBuffer();
    expect(buf.push({ key: "A", timeStamp: 0 })).toEqual({ kind: "char", consume: false, first: true });
    expect(buf.push({ key: "J", timeStamp: 10 })).toEqual({ kind: "char", consume: true, first: false });
  });
});

describe("HID timing invariants", () => {
  it("waits longer before an idle commit than the mid-code stall it tolerates", async () => {
    const { HID_IDLE_COMMIT_MS, HID_BURST_GAP_MS } = await import("../lib/hidScan");
    expect(HID_IDLE_COMMIT_MS).toBeGreaterThan(HID_BURST_GAP_MS);
  });
});
