import { describe, expect, it } from "vitest";
import { groupCodeFromScan, groupUnitsToAdd } from "../lib/groupQr";

describe("group QR scans", () => {
  it("normalizes raw and legacy URL QR payloads", () => {
    expect(groupCodeFromScan("grp-ab12cd")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("https://aggarwaljewellers.in/g/grp-ab12cd?source=label")).toBe("GRP-AB12CD");
    expect(groupCodeFromScan("https://aggarwaljewellers.in/p/AJ1004")).toBeNull();
  });

  it("adds only the group units still available after existing bill lines", () => {
    expect(groupUnitsToAdd(6, 10, 0)).toBe(6);
    expect(groupUnitsToAdd(6, 10, 6)).toBe(4);
    expect(groupUnitsToAdd(6, 6, 6)).toBe(0);
  });
});
