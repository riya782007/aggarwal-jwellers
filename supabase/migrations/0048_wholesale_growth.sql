-- Aggarwal Jewellers — 0048: Wholesale growth pack (features studied from the reference
-- build, implemented natively on Aggarwal's engine). ADDITIVE + IDEMPOTENT.
--   1) Vouchers / coupon engine — % or flat, min-order, cap, channel, schedule, usage limit.
--      Validation + redemption are SERVER-ONLY; the discount is re-derived at order time and
--      posted to the day-book, so orders.total (and therefore GST, receivables, dashboards)
--      stays the single source of truth.
--   2) Wholesale quantity-break tiers — [{"min_qty":12,"pct_off":5},…] on pricing_settings;
--      applied per line at order time (unit_mrp keeps the pre-discount rate so the invoice's
--      existing Rate → Disc → Amount rendering shows it transparently).
--   3) Quote requests (RFQ) — trade portal → owner inbox.
--   4) Dealer self-signup — application with business proof lands as a PENDING wholesale
--      customer (the existing approve flow on the customer page grants access).
--   5) Retail shipping is now BOOKED on the order (extra_courier) — fixes a pre-existing gap
--      where the customer paid ₹50 shipping that never entered the books.

-- 1) Vouchers ----------------------------------------------------------------------------------
create table if not exists public.vouchers (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  kind text not null default 'percent',          -- 'percent' | 'flat'
  value integer not null,                        -- percent (1-90) or paise
  min_order bigint not null default 0,           -- paise
  cap bigint,                                    -- max discount in paise (percent kind)
  channel text not null default 'retail',       -- 'retail' | 'wholesale' | 'all'
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,                           -- null = unlimited
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.vouchers add constraint vouchers_kind_chk check (kind in ('percent','flat'));
  alter table public.vouchers add constraint vouchers_channel_chk check (channel in ('retail','wholesale','all'));
exception when duplicate_object then null; end $$;
alter table public.vouchers enable row level security;

alter table public.orders add column if not exists voucher_code text;
alter table public.orders add column if not exists voucher_discount bigint not null default 0;  -- paise
alter table public.orders add column if not exists tier_discount bigint not null default 0;     -- paise
alter table public.checkout_intents add column if not exists voucher_code text;

-- Atomic redemption: only succeeds while under the usage limit (row-locked).
create or replace function public.redeem_voucher(p_code text)
returns boolean language plpgsql security definer as $$
declare v record;
begin
  select * into v from public.vouchers where upper(code) = upper(p_code) for update;
  if not found or not v.active then return false; end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then return false; end if;
  update public.vouchers set used_count = used_count + 1 where id = v.id;
  return true;
end; $$;

-- 2) Wholesale quantity-break tiers --------------------------------------------------------------
alter table public.pricing_settings add column if not exists wholesale_tiers jsonb not null default '[]'::jsonb;

-- 3) Quote requests (RFQ) ------------------------------------------------------------------------
create table if not exists public.quote_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete set null,
  name text,
  phone text,
  items text not null,                            -- free-text lines: what + how many
  note text,
  status text not null default 'new',             -- 'new' | 'quoted' | 'closed'
  quote_note text,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.quote_requests add constraint quote_requests_status_chk check (status in ('new','quoted','closed'));
exception when duplicate_object then null; end $$;
alter table public.quote_requests enable row level security;

-- 4) Dealer self-signup --------------------------------------------------------------------------
alter table public.customers add column if not exists business_proof_url text;
alter table public.customers add column if not exists signup_note text;
