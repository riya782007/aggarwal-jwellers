-- 0061 — New pricing structure (client instruction):
--   • wholesale/POS price = the entered base wholesale, AS-IS (no markup — was +10%)
--   • retail selling price = 1.5 × wholesale   (then charm-rounded UP to end in 9)
--   • printed MRP          = 4   × wholesale   (then rounded to a multiple of 5, never below retail)
--
-- Two parts, both required:
--   (A) UPDATE the live pricing_settings row — this is what re-prices the whole catalogue now.
--   (B) CREATE OR REPLACE bd_price with matching coalesce defaults, so a fresh/NULL column can
--       never fall back to the old 10% / 2.2× / 2.75× numbers. Mirrors lib/pricing.ts exactly.
--
-- NOTE: products with an explicit per-product/variant override (wholesale_override / retail_override
-- / mrp_override) keep their pinned price — the formula only drives non-overridden items. Clear those
-- overrides if you want every product re-priced by this formula.

-- (A) Re-price the catalogue: markup 0, retail ×1.5, MRP ×4, simple-multiplier mode.
update public.pricing_settings
   set wholesale_markup_pct = 0,
       retail_multiplier    = 1.5,
       mrp_multiplier       = 4,
       use_buildup          = false;

-- (B) Keep the DB pricing function's fallback defaults in lock-step with the new values.
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
    -- %-build-up chain (owner's costing sheet). Wholesale = the entered base.
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers (current formula): NO wholesale markup, retail ×1.5, MRP ×4.
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 0) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 1.5);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
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

-- Sanity probes (run manually to confirm the new structure):
--   select public.bd_price(25000,'wholesale'); -- expect 25000  (₹250 — AS-IS, no markup)
--   select public.bd_price(25000,'retail');    -- expect 37900  (250×1.5=375 → charm ₹379)
--   select public.bd_price(25000,'mrp');       -- expect 100000 (250×4=1000 → ₹1000)
--   select public.bd_price(15000,'retail');    -- expect 22900  (150×1.5=225 → charm ₹229)
--   select public.bd_price(15000,'mrp');       -- expect 60000  (150×4=600 → ₹600)
