-- 0018 — Pricing %-build-up (Module 4 / §4).
--
-- NOTE: in the reference build these objects were applied directly to Supabase via the
-- MCP and were never committed as a migration file. They are reconstructed here so a fresh
-- Aggarwal Jewellers database is complete and self-contained. The build-up math mirrors
-- `lib/pricing.ts` (computePrices / buildupBreakdown) exactly.
--
-- Chain: cost -> +shipping% -> +packing% -> +promotion% (landed)
--             -> +reseller% (WHOLESALE rate) -> +customer_discount% (RETAIL) -> +mrp% (printed MRP)
-- All money in integer paise; display values rounded to `round_to` paise.

-- 1) Build-up inputs on the single global pricing_settings row.
alter table public.pricing_settings add column if not exists use_buildup           boolean not null default false;
alter table public.pricing_settings add column if not exists shipping_pct          numeric not null default 10;
alter table public.pricing_settings add column if not exists packing_pct           numeric not null default 11.36;
alter table public.pricing_settings add column if not exists promotion_pct         numeric not null default 10.2;
alter table public.pricing_settings add column if not exists reseller_pct          numeric not null default 15;
alter table public.pricing_settings add column if not exists customer_discount_pct numeric not null default 5;
alter table public.pricing_settings add column if not exists mrp_pct               numeric not null default 25;

-- 2) Authoritative SQL pricing function (mirrors lib/pricing.ts). Pure/immutable so it can
--    be reused by billing RPCs (place_order etc.). Re-running is idempotent.
create or replace function public.bd_price(
  base_paise            numeric,
  shipping_pct          numeric default 0,
  packing_pct           numeric default 0,
  promotion_pct         numeric default 0,
  reseller_pct          numeric default 0,
  customer_discount_pct numeric default 0,
  mrp_pct               numeric default 0,
  round_to              integer default 100
)
returns table(wholesale_paise integer, retail_paise integer, mrp_paise integer)
language sql
immutable
as $$
  with base as (
    select
      base_paise
        * (1 + coalesce(shipping_pct, 0)  / 100.0)
        * (1 + coalesce(packing_pct, 0)   / 100.0)
        * (1 + coalesce(promotion_pct, 0) / 100.0) as landed,
      greatest(coalesce(round_to, 100), 1) as step
  ),
  tiers as (
    select landed * (1 + coalesce(reseller_pct, 0) / 100.0) as wholesale, step from base
  ),
  built as (
    select
      wholesale,
      wholesale * (1 + coalesce(customer_discount_pct, 0) / 100.0) as retail,
      step
    from tiers
  ),
  final as (
    select
      wholesale,
      retail,
      retail * (1 + coalesce(mrp_pct, 0) / 100.0) as mrp,
      step
    from built
  )
  select
    (round(wholesale / step) * step)::int as wholesale_paise,
    (round(retail    / step) * step)::int as retail_paise,
    (round(mrp       / step) * step)::int as mrp_paise
  from final;
$$;
