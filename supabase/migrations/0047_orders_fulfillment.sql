-- Aggarwal Jewellers — 0047: Website-order fulfillment (feature studied from the reference
-- build; implemented natively). ADDITIVE + IDEMPOTENT.
-- New website orders (retail + wholesale channels) land in an accept/reject queue at
-- /admin/orders; accepted orders move dispatch → deliver with timestamps that power the
-- public order-tracking timeline (/track). Rejection uses cancel_order (0046) so stock,
-- day-book, revenue, Udhaar and the cash book all stay consistent.

alter table public.orders add column if not exists fulfillment text;
do $$ begin
  alter table public.orders add constraint orders_fulfillment_chk
    check (fulfillment is null or fulfillment in ('accepted','rejected'));
exception when duplicate_object then null; end $$;

alter table public.orders add column if not exists dispatched_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;

create index if not exists idx_orders_web_new
  on public.orders(created_at desc)
  where fulfillment is null;

-- Backfill: everything that already happened is treated as accepted, so the new queue
-- starts empty instead of flooding with history.
update public.orders set fulfillment = 'accepted' where channel <> 'pos' and fulfillment is null;
