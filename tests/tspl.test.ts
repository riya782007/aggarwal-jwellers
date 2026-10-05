import { describe, it, expect } from "vitest";
import { buildTsplJob, qrBars, stickerCommands, tsplSafe, wrapText, testLabel } from "@/lib/tspl";
import { qrMatrix } from "@/lib/qr";
import type { PdfLabel } from "@/lib/labelPdf";

const piece: PdfLabel = { name: "Kundan Choker Set with Long Jhumka Earrings", sku: "AJ1004-RED", qrValue: "https://aggarwaljeweller.in/p/AJ1004-RED", priceLine: "A75007100051", showName: true, showSku: true };
const box: PdfLabel = { ...piece, boxLine: "GRP-JS3JA8 · BOX 6" };

function parseBars(cmds: string[]) {
  return cmds.filter((c) => c.startsWith("BAR ")).map((c) => c.slice(4).split(",").map(Number));
}

describe("tspl", () => {
  it("is pure ASCII with no stray quotes inside strings", () => {
    const job = buildTsplJob([piece, box, { ...piece, name: 'He said "hi" ₹ ✓' }]);
    expect(/^[\x0A\x0D\x20-\x7E]*$/.test(job)).toBe(true);
    for (const line of job.split("\r\n").filter((l) => l.startsWith("TEXT"))) {
      expect((line.match(/"/g) ?? []).length).toBe(4); // font + content literals only
    }
  });

  it("prints two stickers per row on a 4in roll and one on a 2in roll", () => {
    const labels = [piece, piece, piece];
    const two = buildTsplJob(labels, { dpmm: 12, layout: "2up" });
    expect(two).toContain("SIZE 101.6 mm,25.4 mm");
    expect(two.match(/PRINT 1,1/g)?.length).toBe(2);
    const one = buildTsplJob(labels, { dpmm: 8, layout: "1up" });
    expect(one).toContain("SIZE 50.8 mm,25.4 mm");
    expect(one.match(/PRINT 1,1/g)?.length).toBe(3);
  });

  it("reproduces our exact QR matrix (same QR as screen and PDF)", () => {
    const cmds = qrBars(piece.qrValue, 0, 0, 225);
    const m = qrMatrix(piece.qrValue);
    const bars = parseBars(cmds);
    const cell = bars[0][3];
    const xs = bars.map((b) => b[0]), ys = bars.map((b) => b[1]);
    const ox = Math.min(...xs), oy = Math.min(...ys);
    const rebuilt = m.map((row) => row.map(() => false));
    for (const [x, y, w] of bars) {
      for (let c = (x - ox) / cell; c < (x - ox + w) / cell; c++) rebuilt[(y - oy) / cell][c] = true;
    }
    expect(rebuilt).toEqual(m);
  });

  it("keeps every mark inside its own 2in sticker at both resolutions", () => {
    for (const dpmm of [8, 12] as const) {
      const dpi = dpmm === 12 ? 300 : 203;
      const fontW: Record<string, number> = dpmm === 12 ? { "1": 12, "2": 16, "3": 24 } : { "1": 8, "2": 12, "3": 16 };
      for (const j of [0, 1]) {
        const xo = j * 2 * dpi;
        const cmds = stickerCommands(box, xo, dpmm);
        for (const [x, y, w, h] of parseBars(cmds)) {
          expect(x).toBeGreaterThanOrEqual(xo);
          expect(x + w).toBeLessThanOrEqual(xo + 2 * dpi);
          expect(y + h).toBeLessThanOrEqual(dpi);
        }
        for (const t of cmds.filter((c) => c.startsWith("TEXT"))) {
          const m = t.match(/^TEXT (\d+),(\d+),"(\d)",0,1,1,"(.*)"$/)!;
          const end = Number(m[1]) + m[4].length * fontW[m[3]];
          expect(end).toBeLessThanOrEqual(xo + 2 * dpi);
        }
      }
    }
  });

  it("always prints the price code and box line on box stickers", () => {
    const cmds = stickerCommands(box, 0, 12).join("\n");
    expect(cmds).toContain("A75007100051");
    expect(cmds).toContain("GRP-JS3JA8");
  });

  it("wraps names on word boundaries and marks truncation", () => {
    const lines = wrapText("Kundan Choker Set with Long Jhumka Earrings", 16, 2);
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.length <= 16)).toBe(true);
    expect(lines[1].endsWith(".")).toBe(true);
    expect(wrapText("Ring", 16, 2)).toEqual(["Ring"]);
  });

  it("sanitises unsafe characters", () => {
    expect(tsplSafe('a"b\\c ₹5 ✓')).toBe("a'b'c Rs5");
    expect(buildTsplJob([testLabel()])).toContain("TEST-001");
  });
});
