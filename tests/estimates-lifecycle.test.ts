import { describe, expect, it } from "vitest";
import { estimateStatusAfterBill, isBilledEstimate, isOpenEstimate, ACTIVE_ESTIMATE_STATUSES } from "../lib/estimates";

describe("estimate lifecycle", () => {
  it("GST bill marks the quote converted (leaves active list)", () => {
    expect(estimateStatusAfterBill("gst")).toBe("converted");
    expect(ACTIVE_ESTIMATE_STATUSES).not.toContain("converted");
  });
  it("Final Estimate (non-GST) marks the quote cash_billed (leaves active list)", () => {
    expect(estimateStatusAfterBill("cash")).toBe("cash_billed");
    expect(ACTIVE_ESTIMATE_STATUSES).not.toContain("cash_billed");
  });
  it("only open quotes without an order are actionable", () => {
    expect(isOpenEstimate("open", null)).toBe(true);
    expect(isOpenEstimate("open", "ord-1")).toBe(false);
    expect(isOpenEstimate("converted", null)).toBe(false);
    expect(isOpenEstimate("cash_billed", null)).toBe(false);
    expect(isOpenEstimate("denied", null)).toBe(false);
  });
  it("billed quotes (GST or final estimate, or linked order) cannot convert again", () => {
    expect(isBilledEstimate("converted", null)).toBe(true);
    expect(isBilledEstimate("cash_billed", null)).toBe(true);
    expect(isBilledEstimate("open", "ord-1")).toBe(true);
    expect(isBilledEstimate("open", null)).toBe(false);
    expect(isBilledEstimate("denied", null)).toBe(false);
  });
});
