/**
 * Estimate lifecycle helpers — shared by the estimates list, conversion, and tests.
 * Status values match public.estimate_status (open | converted | cash_billed | denied | expired).
 *
 * After convert, the quote is a sale: it must leave the Estimates workbench and appear
 * on Sales Records (`orders`), with Sold By copied onto `orders.sales_employee_id`.
 * Rows are never deleted.
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

/** Quotes that still belong in Estimates (not yet a sale). */
export const ESTIMATE_WORKBENCH_STATUSES = ["open", "denied", "expired"] as const;

export const BILLED_ESTIMATE_STATUSES = ["converted", "cash_billed"] as const;

/** Source stamp on orders created from convert — Sales Records "from estimate" badge. */
export const ESTIMATE_ORDER_SOURCE_TAG = "estimate";

export function belongsOnEstimateWorkbench(status?: string | null, orderId?: string | null): boolean {
  if (isBilledEstimate(status, orderId)) return false;
  return status === "open" || status === "denied" || status === "expired";
}

/**
 * Map a list-page tab (or raw status) onto workbench statuses.
 * Billed / "all" / unknown requests never return converted or cash_billed.
 */
export function resolveEstimateWorkbenchStatuses(requested?: string | string[] | null): string[] {
  const workbench = [...ESTIMATE_WORKBENCH_STATUSES];
  if (requested == null || requested === "" || requested === "all") return workbench;
  const list = Array.isArray(requested) ? requested : [requested];
  const allowed = list.filter((s) => (ESTIMATE_WORKBENCH_STATUSES as readonly string[]).includes(s));
  return allowed.length ? allowed : workbench;
}
