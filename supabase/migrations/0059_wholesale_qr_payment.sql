-- 0059 — Wholesale QR (UPI) payment gate
-- Dealers on the trade portal pay by scanning the shop's ICICI UPI QR (no Razorpay).
-- The order must NOT enter the accept → dispatch chain until the owner has personally
-- confirmed the money landed. These columns track that hand-off:
--   payment_ref          — the UPI reference / txn id the dealer types in after paying
--   payment_confirmed_at — set when the OWNER clicks "Payment received" (the gate)
--   payment_confirmed_by — which console role confirmed it (audit)
-- All nullable & additive, so existing retail/POS orders are unaffected.

alter table orders add column if not exists payment_ref          text;
alter table orders add column if not exists payment_confirmed_at timestamptz;
alter table orders add column if not exists payment_confirmed_by text;

-- Fast lookup of wholesale orders still waiting on payment confirmation.
create index if not exists orders_awaiting_wholesale_payment
  on orders (created_at)
  where channel = 'wholesale' and payment_confirmed_at is null;
