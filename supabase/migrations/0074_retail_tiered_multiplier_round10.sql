-- 0074 — Retail pricing rule update (owner):
--   • Tiered retail multiplier: base wholesale BELOW ₹1500 → 1.6×; ₹1500 & ABOVE → 1.5×.
--   • Round retail AND MRP to the nearest ₹10 (was ₹5).
-- Mirrors lib/pricing.ts so DB-priced (POS/estimate RPCs) and JS-priced (labels/display) agree.
create or replace function public.bd_price(p_base integer, p_tier text)
returns integer language plpgsql stable as $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; mrp_rupees int; floor_rupees int; v_mult numeric;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);
  if coalesce(ps.use_buildup, false) then
    shipped := p_base::numeric * (1 + coalesce(ps.shipping_pct,0)/100);
    landed := shipped + coalesce(ps.packing_flat,0) + coalesce(ps.promotion_flat,0);
    withreseller := landed * (1 + coalesce(ps.reseller_pct,0)/100);
    retail_raw := withreseller * (1 + coalesce(ps.customer_discount_pct,0)/100);
    mrp_raw := retail_raw * (1 + coalesce(ps.mrp_pct,0)/100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct,0)/100)) / v_round) * v_round;
    -- Tiered retail multiplier: cheaper pieces get a higher markup.
    v_mult := case when p_base < 150000 then 1.6 else 1.5 end;
    retail_raw := p_base::numeric * v_mult;
    mrp_raw := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
  end if;
  -- Retail & MRP round to the nearest ₹10 (prices end in 0).
  ret_rupees := round(retail_raw / 100.0 / 10.0)::int * 10;
  if ret_rupees <= 0 then ret_rupees := 10; end if;
  retail_out := ret_rupees * 100;
  mrp_rupees := round(mrp_raw / 100.0 / 10.0)::int * 10;
  if mrp_rupees <= 0 then mrp_rupees := 10; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 10.0)::int * 10) * 100;
  end if;
  return (case p_tier when 'wholesale' then wholesale_out when 'mrp' then mrp_out else retail_out end)::int;
end; $function$;
