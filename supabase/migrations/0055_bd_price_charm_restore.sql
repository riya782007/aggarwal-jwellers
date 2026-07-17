-- Aggarwal Jewellers — 0055: restore charm rounding in bd_price (fixes the ₹559-shown /
-- ₹550-billed drift — QA bug #4, the root of the price mismatch on every surface).
--
-- History: 0032 synced bd_price to the JS engine (lib/pricing.ts) — RETAIL charm-rounds UP to
-- the next rupee ending in 9, MRP rounds to the nearest rupee ending in 0/5, never below retail.
-- 0036 then rewrote bd_price for the full build-up chain and ACCIDENTALLY DROPPED the charm
-- rounding, so the storefront/POS UI (JS: ₹559 / ₹690) and the billed order (SQL: ₹550 / ₹688)
-- diverged. This restores 0032's rounding on top of 0036's structure — after this, what the
-- customer sees is exactly what place_order / estimates bill. Mirrors lib/pricing.ts
-- roundRetailCharmPaise / roundMrpTo5Paise EXACTLY (verified value-for-value in tests).
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE only; no data change. Values are integer paise.

CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; bump int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    -- %-build-up chain (owner's costing sheet): shipping% → +packing → +promotion →
    -- reseller% → customer% = retail; retail × mrp% = MRP. Wholesale = the entered base.
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers (current default formula).
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 10) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 2.2);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 2.75);
  end if;

  -- RETAIL: charm-round UP to the next whole rupee ending in 9 (paise in / paise out).
  ret_rupees := greatest(1, round(retail_raw / 100.0)::int);
  bump       := ((9 - (ret_rupees % 10)) + 10) % 10;
  retail_out := (ret_rupees + bump) * 100;

  -- MRP: nearest whole rupee ending in 0/5, never printed below the retail selling price.
  mrp_rupees := round(mrp_raw / 100.0 / 5.0)::int * 5;
  if mrp_rupees <= 0 then mrp_rupees := 5; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 5.0)::int * 5) * 100;
  end if;

  return (case p_tier
            when 'wholesale' then wholesale_out
            when 'mrp' then mrp_out
            else retail_out end)::int;
end; $function$;

-- Sanity probes (run manually if you like):
--   select public.bd_price(25000,'retail');    -- expect 55900  (₹559 — matches storefront)
--   select public.bd_price(25000,'mrp');       -- expect 69000  (₹690)
--   select public.bd_price(25000,'wholesale'); -- expect 27500  (₹275)
--   select public.bd_price(15000,'retail');    -- expect 33900  (₹339)
--   select public.bd_price(15000,'mrp');       -- expect 41500  (₹415)
