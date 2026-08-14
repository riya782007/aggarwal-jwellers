/**
 * Estimate lifecycle helpers — shared by the estimates list, conversion, and tests.
 * Status values match public.estimate_status (open | converted | cash_billed | denied | expired).
 */

export type EstimateStatus = "open" | "converted" | "cash_billed" | "denied" | "expired" | string;

/** GST tax invoice vs non-GST "Final Estimate" document. */
export function estimateStatusAfterBill(billType: "gst" | "cash"): "converted" | "cash_billed" {
  return billType === "gst" ? "converted" : "cash_billed";
}

export function isOpenEstimate(status?: string | null, orderId?: string | null): boolean {
  return status === "open" && !orderId;
}

export function isBilledEstimate(status?: string | null, orderId?: string | null): boolean {
  return status === "converted" || status === "cash_billed" || !!orderId;
}

/** Statuses shown on the default (active) estimates list — query-level, not CSS hide. */
export const ACTIVE_ESTIMATE_STATUSES = ["open"] as const;
