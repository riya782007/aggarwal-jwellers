import { describe, expect, it } from "vitest";
import { groupCodeFromScan, groupUnitsToAdd, parseGroupScan } from "../lib/groupQr";

describe("group QR scans", () => {
  it("normalizes raw and legacy URL QR payloads", () => {
    expect(groupCodeFromScan("grp-ab12cd")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("*GRP-AB12CD*")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("grpab12cd")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("https://aggarwaljewellers.in/g/grp-ab12cd?source=label")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("https://aggarwaljewellers.in/p/AJ1004")).toBeNull();
  });

  it("treats the printed BOX:sku:qty sticker as a pack scan, not a missing product", () => {
    // Live shelf sticker (Dhwani Earrings AJDH1931 ×12) — QR payload, not the visible price code.
    expect(groupCodeFromScan("BOX:AJDH1931:12")).toBe("BOX:AJDH1931:12");
    expect(parseGroupScan("BOX:AJDH1931:12")).toEqual({
      kind: "box", sku: "AJDH1931", packQty: 12, code: "BOX:AJDH1931:12",
    });
    expect(groupCodeFromScan("https://aggarwaljewellers.in/g/BOX:AJDH1931:12")).toBe("BOX:AJDH1931:12");
    expect(groupCodeFromScan("https://aggarwaljewellers.in/g/BOX%3AAJDH1931%3A12")).toBe("BOX:AJDH1931:12");
    expect(groupCodeFromScan("BOX;AJDH1931;12")).toBe("BOX:AJDH1931:12");
    expect(groupCodeFromScan("*BOX:AJDH1931:12*")).toBe("BOX:AJDH1931:12");
    expect(groupCodeFromScan("box:bajdj.pin13:6")).toBe("BOX:BAJDJ.PIN13:6");
  });

  it("does not treat a piece SKU or a product-page QR as a box", () => {
    expect(groupCodeFromScan("AJDH1931")).toBeNull();
    expect(parseGroupScan("AJ1004-RED")).toBeNull();
    expect(groupCodeFromScan("https://aggarwaljewellers.in/p/AJDH1931")).toBeNull();
  });

  it("adds only the group units still available after existing bill lines", () => {
    expect(groupUnitsToAdd(6, 10, 0)).toBe(6);
    expect(groupUnitsToAdd(6, 10, 6)).toBe(4);
    expect(groupUnitsToAdd(6, 6, 6)).toBe(0);
    expect(groupUnitsToAdd(6, 0, 0, true)).toBe(6);
  });
});
