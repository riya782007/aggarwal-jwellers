-- 0019 — Online payment reference on orders.
--
-- NOTE: like 0018, this column existed in the reference's live Supabase but was never
-- committed as a migration file. Reconstructed here so the schema is complete.
-- `app/actions/checkoutOnline.ts` writes the Razorpay payment id into orders.payment_ref
-- after a successful online payment, giving every paid order a verifiable gateway reference.

alter table public.orders add column if not exists payment_ref text;

-- Helps reconcile a gateway settlement back to its order.
create index if not exists idx_orders_payment_ref on public.orders(payment_ref) where payment_ref is not null;
