-- Aggarwal Jewellers — 0054: add the B2B buyer columns the app writes but no migration ever created.
-- QA (16 Jul) found EVERY POS sale's post-billing update failing silently with
--   column "buyer_gstin" of relation "orders" does not exist
-- (the columns existed only in the reference project's DB, added by hand there, never migrated).
-- Because Supabase updates are all-or-nothing, that one bad column silently discarded the WHOLE
-- payload on every counter bill: partial payment (amount_paid), tender split (pay_cash/pay_bank),
-- customer link (customer_id) and salesperson attribution (sales_employee_id) — every POS bill
-- recorded as fully paid to a walk-in with no employee tally. ADDITIVE + IDEMPOTENT.

alter table public.orders add column if not exists buyer_gstin   text;
alter table public.orders add column if not exists buyer_address text;
alter table public.orders add column if not exists buyer_state   text;
