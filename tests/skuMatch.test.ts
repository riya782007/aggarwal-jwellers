import { describe, expect, it } from "vitest";
import { buildSkuIndex, canonicalSku, longestSkuToken, matchSku, suggestSkus, variantLabel } from "../lib/skuMatch";

const catalog = [
  { sku: "AJDH1931", name: "Dhwani Earrings" },
  { sku: "A3SAJNI13124MHWT-210", name: "Stone Bangle · 2.10" },
  { sku: "A3SAJNI13124MHWT-28", name: "Stone Bangle · 2.8" },
  { sku: "AJSIGDE542-RED", name: "Signature Set · Red" },
  // two items that only differ by separators — must never be guessed between
  { sku: "KP-12-3", name: "Kundan A" },
  { sku: "KP-1-23", name: "Kundan B" },
];

describe("separator-blind SKU canonicalisation", () => {
  it("treats dots, dashes, spaces, NBSP and en-dashes as the same SKU", () => {
    for (const s of ["A3SAJNI13124MHWT-210", "A3SAJNI13124MHWT-2.10", "a3sajni13124mhwt 210 ", "A3SAJNI13124MHWT–210", "A3SAJNI13124MHWT-210 "]) {
      expect(canonicalSku(s)).toBe("A3SAJNI13124MHWT210");
    }
  });
  it("keeps different sizes different", () => {
    expect(canonicalSku("A3SAJNI13124MHWT-28")).not.toBe(canonicalSku("A3SAJNI13124MHWT-210"));
  });
  it("picks the design code as the search token", () => {
    expect(longestSkuToken("A3SAJNI13124MHWT-210")).toBe("A3SAJNI13124MHWT");
  });
});

describe("in-memory sticker matching", () => {
  const index = buildSkuIndex(catalog, { "AJ1000-RED": "AJSIGDE542-RED", "AJDH1931": "SHOULD-NOT-WIN" });

  it("matches exact SKUs case-insensitively, including /p/ URLs from old labels", () => {
    expect(matchSku(index, "ajdh1931")).toEqual({ item: catalog[0], via: "exact" });
    expect(matchSku(index, "https://aggarwaljewellers.in/p/AJDH1931")?.item).toBe(catalog[0]);
  });

  it("resolves a sticker printed before the SKU was renamed", () => {
    expect(matchSku(index, "AJ1000-RED")).toEqual({ item: catalog[3], via: "alias" });
    expect(matchSku(index, "aj1000-red")?.item.sku).toBe("AJSIGDE542-RED");
  });

  it("never lets an alias shadow a live SKU", () => {
    expect(matchSku(index, "AJDH1931")?.via).toBe("exact");
  });

  it("matches a size sticker whose separators differ from the stored SKU", () => {
    expect(matchSku(index, "A3SAJNI13124MHWT-2.10")).toEqual({ item: catalog[1], via: "canonical" });
    expect(matchSku(index, "A3SAJNI13124MHWT 210")?.item).toBe(catalog[1]);
  });

  it("refuses to guess when two items share a separator-blind spelling", () => {
    expect(matchSku(index, "KP123")).toBeNull();
    expect(matchSku(index, "KP-12-3")?.item.name).toBe("Kundan A"); // exact still works
  });

  it("returns null for unknown codes", () => {
    expect(matchSku(index, "ZZ9999")).toBeNull();
  });

  it("suggests same-design SKUs for a miss", () => {
    expect(suggestSkus(catalog, "A3SAJNI13124MHWT-2.6")).toEqual(["A3SAJNI13124MHWT-210", "A3SAJNI13124MHWT-28"]);
    expect(suggestSkus(catalog, "ZZ")).toEqual([]);
  });
});

describe("variant names on the bill", () => {
  it("names colour, size and polish", () => {
    expect(variantLabel("STONE 4PC BANGLE", { size: "2.10" })).toBe("STONE 4PC BANGLE · 2.10");
    expect(variantLabel("STONE 4PC BANGLE", { color: "Red", size: "2.4" })).toBe("STONE 4PC BANGLE · Red · 2.4");
    expect(variantLabel("RING", {})).toBe("RING");
  });
});

describe("counter-side (possibly stale) index", () => {
  it("never makes a separator-blind guess locally — that is the server's call", () => {
    const index = buildSkuIndex(catalog);
    expect(matchSku(index, "A3SAJNI13124MHWT-2.10", { canonical: false })).toBeNull();
    expect(matchSku(index, "ajdh1931", { canonical: false })?.via).toBe("exact");
  });
});
