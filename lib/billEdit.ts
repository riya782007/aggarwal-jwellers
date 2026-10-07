/**
 * lib/billEdit.ts — pure maths for editing a saved Final Estimate (cash bill).
 *
 * Shared by the invoice page's "Edit items" panel (live preview) and the server action
 * (permission check + payload), so what staff see before saving is exactly what is sent.
 * All money is in paise. The database (edit_order_items, docs/0081) is the final authority.
 */

export type BillEditLine = {
  /** order_items.id for a line already on the bill; absent for a newly added item. */
  itemId?: string;
  sku: string;
  name: string;
  qty: number;
  /** Unit rate in paise. */
  rate: number;
  /** As saved on the bill (existing lines only). */
  origQty?: number;
  origRate?: number;
  /** Existing line the user removed. */
  removed?: boolean;
};

export type BillEditPlan = {
  /** Body for edit_order_items: the whole bill as it should be. */
  payload: { item_id?: string; sku?: string; qty: number; unit_price: number }[];
  newTotal: number;
  /** Anything changed at all. */
  changed: boolean;
  /** A line removed or its quantity lowered — stock goes back, like a return. */
  givesBack: boolean;
  /** Money handed back to the customer on save (paid more than the new total). */
  refund: number;
  /** Still to collect after save. */
  due: number;
  /** Empty when the plan is valid, else a staff-friendly reason. */
  problem: string;
};

const MAX_QTY = 100000;

export function planBillEdit(lines: BillEditLine[], extrasPaise: number, paidPaise: number, oldTotalPaise: number): BillEditPlan {
  const live = lines.filter((l) => !l.removed);
  let problem = "";
  if (live.length === 0) problem = "A bill needs at least one item. To remove everything, cancel the bill instead.";
  for (const l of live) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) { problem ||= `Quantity for ${l.sku} must be a whole number of 1 or more.`; }
    if (!Number.isFinite(l.rate) || l.rate < 0) { problem ||= `Rate for ${l.sku} cannot be negative.`; }
  }
  const seen = new Set<string>();
  for (const l of live) {
    const k = l.sku.trim().toUpperCase();
    if (seen.has(k)) problem ||= `${l.sku} is on the bill twice — keep one line and change its quantity.`;
    seen.add(k);
  }

  const payload = live.map((l) =>
    l.itemId
      ? { item_id: l.itemId, qty: l.qty, unit_price: Math.round(l.rate) }
      : { sku: l.sku.trim(), qty: l.qty, unit_price: Math.round(l.rate) },
  );
  const newTotal = live.reduce((s, l) => s + Math.round(l.rate) * l.qty, 0) + extrasPaise;
  const added = live.some((l) => !l.itemId);
  const removed = lines.some((l) => l.itemId && l.removed);
  const edited = live.some((l) => l.itemId && (l.qty !== l.origQty || Math.round(l.rate) !== l.origRate));
  const givesBack = removed || live.some((l) => l.itemId && l.origQty != null && l.qty < l.origQty);
  const refund = Math.max(0, paidPaise - Math.max(0, newTotal));
  const due = Math.max(0, roundRupee(newTotal) - (paidPaise - refund));
  return { payload, newTotal, changed: added || removed || edited || newTotal !== oldTotalPaise, givesBack, refund, due, problem };
}

/** Cash bills settle to the nearest rupee (same as order_grand_paise for a cash bill). */
export function roundRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/**
 * Server-side: does applying `next` to the bill's current lines put stock back (remove a line or
 * lower a quantity)? Used to require the same permission as Returns / Cancel bill.
 */
export function editGivesBack(current: { id: string; qty: number }[], next: { item_id?: string; qty: number }[]): boolean {
  const byId = new Map(next.filter((n) => n.item_id).map((n) => [n.item_id as string, n.qty]));
  return current.some((c) => !byId.has(c.id) || (byId.get(c.id) as number) < c.qty);
}
