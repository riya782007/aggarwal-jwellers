-- 0062 — three client changes:
--   1. RETAIL price now rounds to the nearest 0/5 (like MRP), not "ends in 9".
--   2. Wholesale minimum order raised ₹3,000 → ₹10,000.
--   3. Self-service wholesale accounts: add customers.password_hash (buyers log in at checkout).

-- (2) Minimum wholesale order → ₹10,000 (paise).
update public.pricing_settings set wholesale_min_order = 1000000;

-- (3) Password for self-service trade accounts (scrypt hash written by the app; never plaintext).
alter table public.customers add column if not exists password_hash text;

-- (1) Mirror the retail rounding change into the DB pricing function: retail → nearest 0/5.
CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers: NO wholesale markup, retail ×1.5, MRP ×4.
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 0) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 1.5);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
  end if;

  -- RETAIL: nearest whole rupee ending in 0/5 (client rule — same rounding as MRP).
  ret_rupees := round(retail_raw / 100.0 / 5.0)::int * 5;
  if ret_rupees <= 0 then ret_rupees := 5; end if;
  retail_out := ret_rupees * 100;

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

-- Sanity probes:
--   select public.bd_price(15000,'retail'); -- expect 22500 (150×1.5=225 → ₹225, ends in 5)
--   select public.bd_price(25000,'retail'); -- expect 37500 (250×1.5=375 → ₹375)
--   select public.bd_price(15000,'mrp');    -- expect 60000 (150×4=600 → ₹600)
