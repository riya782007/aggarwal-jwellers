import { describe, expect, it } from "vitest";
import {
  estimateStatusAfterBill,
  isBilledEstimate,
  isOpenEstimate,
  belongsOnEstimateWorkbench,
  resolveEstimateWorkbenchStatuses,
  ACTIVE_ESTIMATE_STATUSES,
  ESTIMATE_WORKBENCH_STATUSES,
  BILLED_ESTIMATE_STATUSES,
  ESTIMATE_ORDER_SOURCE_TAG,
} from "../lib/estimates";

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
  it("converted quotes leave the Estimates workbench entirely (they are sales)", () => {
    expect(belongsOnEstimateWorkbench("converted", null)).toBe(false);
    expect(belongsOnEstimateWorkbench("cash_billed", null)).toBe(false);
    expect(belongsOnEstimateWorkbench("open", "ord-1")).toBe(false);
    expect(belongsOnEstimateWorkbench("open", null)).toBe(true);
    expect(belongsOnEstimateWorkbench("denied", null)).toBe(true);
    expect(belongsOnEstimateWorkbench("expired", null)).toBe(true);
    for (const s of BILLED_ESTIMATE_STATUSES) {
      expect(ESTIMATE_WORKBENCH_STATUSES).not.toContain(s);
    }
  });
  it("list tabs cannot request billed statuses — they coerce to the workbench", () => {
    expect(resolveEstimateWorkbenchStatuses("converted")).toEqual([...ESTIMATE_WORKBENCH_STATUSES]);
    expect(resolveEstimateWorkbenchStatuses("cash_billed")).toEqual([...ESTIMATE_WORKBENCH_STATUSES]);
    expect(resolveEstimateWorkbenchStatuses("all")).toEqual([...ESTIMATE_WORKBENCH_STATUSES]);
    expect(resolveEstimateWorkbenchStatuses("open")).toEqual(["open"]);
    expect(resolveEstimateWorkbenchStatuses(["denied", "expired"])).toEqual(["denied", "expired"]);
  });
  it("converted sales are tagged so Sales Records can show from-estimate", () => {
    expect(ESTIMATE_ORDER_SOURCE_TAG).toBe("estimate");
  });
});
