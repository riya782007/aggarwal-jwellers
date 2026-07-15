-- Aggarwal Jewellers — 0049: Marketing + back-office pack (features studied from the
-- reference build, implemented natively). ADDITIVE + IDEMPOTENT.
--   1) Promotions v2 — placement (hero | strip | popup), scheduling window, headline and an
--      optional voucher code hook; the storefront strip/popup render only inside the window.
--   2) Real abandoned-cart tracking — carts upsert by a stable browser key while the customer
--      shops; the Abandoned page shows only carts idle 30+ minutes that never converted,
--      and a completed checkout marks its cart recovered.

-- 1) Promotions v2 -------------------------------------------------------------------------------
alter table public.promotions add column if not exists placement text not null default 'hero';
do $$ begin
  alter table public.promotions add constraint promotions_placement_chk check (placement in ('hero','strip','popup'));
exception when duplicate_object then null; end $$;
alter table public.promotions add column if not exists starts_at timestamptz;
alter table public.promotions add column if not exists ends_at timestamptz;
alter table public.promotions add column if not exists headline text;
alter table public.promotions add column if not exists coupon_code text;

-- 2) Abandoned carts v2 --------------------------------------------------------------------------
alter table public.abandoned_carts add column if not exists cart_key text;
alter table public.abandoned_carts add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_abandoned_cart_key on public.abandoned_carts(cart_key) where cart_key is not null;
