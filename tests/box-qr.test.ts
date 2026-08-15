import { describe, expect, it } from "vitest";
import {
  boxQrPayload,
  parseBoxScan,
  isBoxScan,
  ownerPriceCode,
  boxLabelPriceLine,
  boxPdfLabel,
  boxScanFeedback,
} from "../lib/boxQr";

describe("box QR payload", () => {
  it("encodes the piece SKU and pack count, not a random GRP code", () => {
    expect(boxQrPayload("AJ1004", 5)).toBe("BOX:AJ1004:5");
    expect(boxQrPayload("AJ1004-RED", 6)).toBe("BOX:AJ1004-RED:6");
    expect(boxQrPayload("AJ1004", 5)).not.toMatch(/^GRP-/);
  });

  it("parses the payload back to the same SKU and qty", () => {
    expect(parseBoxScan("BOX:AJ1004:5")).toEqual({ kind: "payload", sku: "AJ1004", packQty: 5 });
    expect(parseBoxScan("BOX:AJ1004-RED:6")).toEqual({ kind: "payload", sku: "AJ1004-RED", packQty: 6 });
    expect(parseBoxScan("https://shop.example/g/BOX:AJ1004:5")).toEqual({ kind: "payload", sku: "AJ1004", packQty: 5 });
    expect(parseBoxScan("  BOX:AJ1004:5\r")).toEqual({ kind: "payload", sku: "AJ1004", packQty: 5 });
  });

  it("still recognises already-printed GRP-… stickers", () => {
    expect(parseBoxScan("GRP-K7Q2AB")).toEqual({ kind: "legacyCode", code: "GRP-K7Q2AB" });
    expect(parseBoxScan("/g/GRP-K7Q2AB")).toEqual({ kind: "legacyCode", code: "GRP-K7Q2AB" });
  });

  it("does not treat a normal piece SKU as a box", () => {
    expect(parseBoxScan("AJ1004")).toBeNull();
    expect(parseBoxScan("AJ1004-RED")).toBeNull();
    expect(isBoxScan("AJ1004")).toBe(false);
    expect(isBoxScan("BOX:AJ1004:5")).toBe(true);
  });

  it("prints the piece SKU on the sticker and the payload in the QR", () => {
    const lab = boxPdfLabel({ sku: "AJ1004", name: "Kundan bangle", packQty: 5, price: 100000, wholesale: 50000 });
    expect(lab.sku).toBe("AJ1004");
    expect(lab.qrValue).toBe("BOX:AJ1004:5");
    expect(lab.priceLine).toBe("×5  A75007100051");
    expect(ownerPriceCode(50000, 100000)).toBe("A75007100051");
    expect(boxLabelPriceLine(5, 0, 0)).toBe("BOX OF 5");
  });

  it("scan feedback shows SKU, pack count, each and box total", () => {
    const f = boxScanFeedback({ sku: "AJ1004", name: "Kundan bangle", packQty: 5, addQty: 5, unitPaise: 100000, stock: 40 });
    expect(f.ok).toBe(true);
    expect(f.text).toContain("AJ1004");
    expect(f.text).toContain("×5");
    expect(f.text).toContain("ea");
    expect(f.text).toContain("box");
  });
});
