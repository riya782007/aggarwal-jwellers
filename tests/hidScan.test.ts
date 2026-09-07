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
