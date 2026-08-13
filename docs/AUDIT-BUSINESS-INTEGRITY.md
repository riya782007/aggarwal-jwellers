# Business Workflow Integrity Audit — 2026-07-15

_Scope: every money- and stock-moving chain in the Aggarwal platform, traced end-to-end
through server actions, RPCs (migrations 0001–0044), views, queries and pages. UI/styling
out of scope. Fixes shipped in this change-set + `supabase/migrations/0045_receivables_integrity.sql`._

## 1. Workflow dependency map (as-built)

| Business event | Chain (writes → derived reads) |
|---|---|
| POS/GST sale (`createPosOrder`) | RPC `record_sale` (stock↓, `stock_adjustments`, order+items) → extra charges fold into `total` → tender split `pay_cash`/`pay_bank` + `amount_paid` (capped by trg `cap_amount_paid` at GRAND total) → `payment_method_transactions` → `assign_invoice_no` → invoice page, Sales, Cash book (`cash_bank_summary` = Σ pay_cash/pay_bank), Dashboard, Udhaar |
| Online checkout (`checkoutOnline`) | Razorpay verify → order marked paid (`amount_paid=total`, bank bucket) → same downstream |
| Bill payment (`record_payment`) | orders.amount_paid/pay_× ↑ → `ledger` (cash/bank credit) → invoice balance, Cash book, Udhaar |
| Party payment (`record_party_payment`, 0043/0045) | FIFO allocation across open bills → same per-bill writes → surplus → `customers.credit_balance` (advance) → `party_payments` audit row → `audit_log` |
| Sales return (`record_sales_return`) | stock↑ (+variant rollup) + `stock_adjustments` + `returns` + `ledger` debit → **(0045)** `orders.return_amount` ↑ → invoice balance / Udhaar / health view |
| Purchase (`record_purchase` RPC + allocation) | purchases+items, stock↑, `supplier_payments` allocated never-over-bill → payables = Σpurchase.total − Σsupplier_payments |
| Purchase delete | `delete_purchase_cascade` reverses stock via `stock_adjustments` (OTP-gated via approvals) |
| Product create (all 4 paths: form, bulk, DIVA, quick-add) | `insertOne` → formula prices (`computePrices`) → draft → AI content best-effort → catalogue/shop revalidate |
| Stock adjust (UI + DIVA) | products/variants qty + `stock_adjustments` (source of the reconciliation view) |

## 2. Bugs found & fixed

| # | Severity | Bug | Root cause | Fix |
|---|---|---|---|---|
| 1 | **HIGH** | Every aggregated receivable (Udhaar page, dashboard Udhaar card, customer Outstanding, DIVA `receivables`, `v_accounting_health.receivable_paise`, `v_party_outstanding`, party-payment allocation) used **pre-tax `orders.total` − amount_paid**, while the invoice's authoritative "Balance due" is the **GST-inclusive grand total** (total+3%, rounded ₹1). Open GST bills were understated by exactly the GST — the "ledger got ₹1000 instead of ₹1180" class. Party payments under-allocated and mis-parked the GST portion as an "advance" while the invoice still showed a balance. | No single source of truth for "what does the customer owe on this bill"; each consumer re-derived it differently. | **One formula, two mirrors:** TS `orderGrandPaise`/`orderDuePaise` (lib/business.ts) and SQL `order_grand_paise()` (0045). All seven consumers rebuilt on it. |
| 2 | **HIGH** | `record_party_payment` (0043) **added** surplus to `customers.credit_balance`, whose positive direction means "customer owes us" (Customers page 'Outstanding due ₹'). An advance was recorded as MORE debt. | Sign convention not checked against the existing field semantics. | 0045 subtracts the surplus; guarded one-time data correction (−2×mis-signed advances) with an audit-log marker so re-runs are safe. |
| 3 | **HIGH** | **Sales returns never propagated to receivables.** `record_sales_return` restocked and wrote the day-book, but `orders.total/amount_paid` were untouched → an unpaid bill still showed the full pre-return due on the invoice, Udhaar and allocation. | Missing edge in the event chain (return → receivable). | New `orders.return_amount` (backfilled from historical return ledger rows); grand/due formula is net of returns; RPC updated; invoice shows a "Less: goods returned" line; `v_overpaid_orders` becomes a genuine refund-due list. |
| 4 | **MEDIUM** | **Over-tender inflated cash-in-hand.** `record_payment` added the full amount to `pay_cash/pay_bank`; the cap trigger clamped only `amount_paid` → Σpay buckets drifted above Σamount_paid, overstating `cash_bank_summary`. | Trigger guards one column; RPC wrote three. | 0045 `record_payment` locks the row, computes true due, clamps the applied amount, errors on already-settled bills (UI only offers the form when due > 0). |
| 5 | **MEDIUM** | `getCreditors()` (Udhaar page + dashboard card) **included cancelled/void/refunded bills** in receivables (customer page and health view excluded them — three different status filters existed). | Inconsistent status filtering. | Shared `DEAD_ORDER_STATUSES`/`isDeadOrder` used by all consumers, incl. dashboard revenue/collections and both SQL views/RPCs (`cancelled, void, refunded`). |
| 6 | **MEDIUM** | Dashboard revenue/orders/cash-collected counted dead orders (no status filter in `getDashboardData`). | Same as #5. | Filtered via `isDeadOrder`. |
| 7 | **LOW** | Double-click on "✓ Received" (Udhaar / customer page) could record a payment twice — server-action forms don't self-disable. | No pending-state guard. | `<SubmitOnce/>` (useFormStatus) on both forms. |
| 8 | **LOW** | Concurrent party payments could double-allocate against the same bill. | No row locks in the allocation loop. | `FOR UPDATE` in 0045's cursor; `record_payment` also locks its row. |

## 3. Verified-sound (no change needed)

- **Stock chain**: every movement (sale, purchase, return, adjustment, purchase-delete) writes `stock_adjustments`; `v_inventory_reconciliation` catches drift; variant→product qty rollups present; oversell guard (0006) and backorder flag intact.
- **Purchases/payables**: allocation never over-pays a bill; payables = Σpurchase totals − Σpayments — single-source consistent.
- **SKU uniqueness**: `nextSku` has a read-then-insert race, but `products.sku unique` makes the loser fail loudly instead of duplicating (bulk path increments locally). Acceptable.
- **amount_paid cap trigger (0034)** matches the shared grand-total formula (exclusive GST bills); now doubly guarded by the clamping RPC.
- **GST split math** (`gstSplit`/`gstSplitExclusive`): rounding halves reconcile (cgst+sgst = tax); invoice round-off line matches the ₹1 rounding used in the cap and the shared formula.
- **Checkout online**: verifies signature before marking paid; bank bucket + payment id recorded.

## 4. Remaining risks (known, documented, not silently "fixed")

1. **Cash refunds are not modelled.** A return on an already-paid bill now surfaces on `v_overpaid_orders` (refund due), but handing cash back is not recorded anywhere (cash book will overstate until an expense/refund entry feature exists). Recommended next: a `refund` tender type mirrored into `pay_cash`-negative or `supplier_payments`-style outflow table.
2. **Order cancellation flow**: statuses `cancelled/void/refunded` are now excluded everywhere, but there is no UI action that sets them while also reversing stock/tender — if introduced, it must reverse `record_sale` effects.
3. **`gst_mode='inclusive'` GST bills**: cap trigger still allows amount_paid up to total+3% (upper bound only); the shared due formula treats them correctly, so no financial drift — cosmetic looseness only.
4. **SKU prefix**: `insertOne` generates `BD####` (legacy Blythe Diva) — plan says `AJ####`. Not a financial bug; change deliberately (existing barcodes/QRs printed with BD SKUs keep scanning either way).
5. **`ledger.balance`** column is only maintained by the returns path; payment rows leave it null (cash book doesn't read it). Harmless today; normalise if the day-book ever displays running balance.

## 5. Files modified

`lib/business.ts` (shared formula + dead statuses) · `lib/supabase/queries.ts` (getCreditors, getCustomerById, getDashboardData) · `app/actions/diva.ts` (receivables) · `app/(admin)/admin/invoice/[id]/page.tsx` (balance due + return-credit line + status) · `app/(admin)/admin/creditors/page.tsx`, `app/(admin)/admin/customer/[id]/page.tsx` (SubmitOnce) · `components/admin/SubmitOnce.tsx` (new) · `supabase/migrations/0045_receivables_integrity.sql` (new) · `tests/receivables.test.ts` (new, 7 cases).

## 6. Regression tests

- **Shipped**: `tests/receivables.test.ts` — grand/due formula across cash, GST exclusive/inclusive, ₹1 rounding, returns netting, over/partial payment clamps, dead statuses. Full suite: 107 passing (5 failures pre-date this audit: pricing-formula constant drift in `pricing/offers/content/imagePrompt/smoke` tests — they fail identically on the untouched tree; flagged separately, not masked).
- **Recommended next** (need a DB harness): party payment allocates oldest-first & stops at grand total; surplus decreases credit_balance; sales return reduces Udhaar by returned value × GST factor; record_payment refuses over-tender; concurrent double-submit records once.
