import { describe, it, expect } from "vitest";
import { makeWholesalePass, checkWholesalePass, WHOLESALE_PASS_DAYS } from "@/lib/wholesalePass";

const S = "secret-A|pass";
const NOW = Date.UTC(2026, 10, 28);
const DAY = 86_400_000;

describe("wholesale pass for shared catalogue links", () => {
  it("a fresh pass opens the wholesale view", () => {
    const t = makeWholesalePass(S, NOW + WHOLESALE_PASS_DAYS * DAY);
    expect(checkWholesalePass(S, t, NOW)).toBe(true);
    expect(checkWholesalePass(S, t, NOW + 29 * DAY)).toBe(true);
  });
  it("expires after the validity window", () => {
    const t = makeWholesalePass(S, NOW + WHOLESALE_PASS_DAYS * DAY);
    expect(checkWholesalePass(S, t, NOW + 31 * DAY)).toBe(false);
  });
  it("cannot be forged, extended or reused with another secret", () => {
    const t = makeWholesalePass(S, NOW + DAY);
    const [, sig] = t.split(".");
    const later = Math.floor((NOW + 999 * DAY) / 1000).toString(36);
    expect(checkWholesalePass(S, `${later}.${sig}`, NOW)).toBe(false);
    expect(checkWholesalePass("other|secret", t, NOW)).toBe(false);
    expect(checkWholesalePass(S, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), NOW)).toBe(false);
  });
  it("rejects missing or junk values (retail stays the default)", () => {
    for (const bad of [undefined, null, "", "x", "a.b.c", "zz.", ".sig", "x".repeat(100)])
      expect(checkWholesalePass(S, bad as any, NOW)).toBe(false);
    expect(checkWholesalePass("", makeWholesalePass("", NOW + DAY), NOW)).toBe(false);
  });
});
