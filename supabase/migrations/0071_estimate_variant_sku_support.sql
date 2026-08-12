-- 0071 — Estimates: resolve VARIANT skus (colour/size), not just product skus.
-- Bug: create_estimate looked up only public.products, so a real in-stock variant sku like
-- "AJPRIDE7032-GREEN" raised "Product ... not found" on save (the POS place_order already
-- handled variants; estimates did not). convert_estimate_v2 likewise decremented the parent
-- product's qty instead of the variant's. Both now mirror place_order's proven variant logic.

-- Variant-aware tier price: variant override → product override → formula on base_wholesale.
create or replace function public.aj_variant_tier_price(p_product public.products, p_variant public.variants, p_tier text)
returns integer language plpgsql stable as $$
begin
  if p_tier = 'wholesale' then
    return coalesce(p_variant.wholesale_override, p_product.wholesale_override, public.bd_price(p_product.base_wholesale, 'wholesale'));
  elsif p_tier = 'mrp' then
    return coalesce(p_variant.mrp_override, p_product.mrp_override, public.bd_price(p_product.base_wholesale, 'mrp'));
  else
    return coalesce(p_variant.retail_override, p_product.retail_override, public.bd_price(p_product.base_wholesale, 'retail'));
  end if;
end; $$;

create or replace function public.create_estimate(p_items jsonb, p_customer jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; prod public.products; var public.variants; v_est uuid; v_qty int; v_price int; v_total bigint := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'No items on the estimate'; end if;
  insert into public.estimates(customer_name, customer_phone, total, status)
  values (nullif(trim(coalesce(p_customer->>'name','')), ''), nullif(trim(coalesce(p_customer->>'phone','')), ''), 0, 'open')
  returning id into v_est;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    -- PRODUCT sku first, else a VARIANT sku (bill the variant, priced off its parent + own overrides).
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod.id is not null then
      v_price := public.aj_tier_price(prod, 'retail');
      insert into public.estimate_items(estimate_id, product_id, qty, unit_price, line_total)
      values (v_est, prod.id, v_qty, v_price, v_price * v_qty);
    else
      select * into var from public.variants where upper(sku) = upper(it->>'sku') limit 1;
      if var.id is null then raise exception 'Product % not found', it->>'sku'; end if;
      select * into prod from public.products where id = var.product_id;
      if prod.id is null then raise exception 'Product % not found', it->>'sku'; end if;
      v_price := public.aj_variant_tier_price(prod, var, 'retail');
      insert into public.estimate_items(estimate_id, product_id, variant_id, qty, unit_price, line_total)
      values (v_est, prod.id, var.id, v_qty, v_price, v_price * v_qty);
    end if;
    v_total := v_total + (v_price::bigint * v_qty);
  end loop;
  update public.estimates set total = v_total where id = v_est;
  return jsonb_build_object('estimate_id', v_est, 'total', v_total);
end; $$;

create or replace function public.convert_estimate_v2(p_estimate_id uuid, p_bill_type text default 'cash', p_allow_oversell boolean default false)
returns jsonb language plpgsql as $$
declare est public.estimates; li record; v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  -- Oversell guard: VARIANT stock for variant lines, else PRODUCT stock.
  for li in select ei.qty, ei.product_id, ei.variant_id, p.sku as p_sku, p.qty as p_qty, v.sku as v_sku, v.qty as v_qty
            from public.estimate_items ei
            join public.products p on p.id = ei.product_id
            left join public.variants v on v.id = ei.variant_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell then
      if li.variant_id is not null and coalesce(li.v_qty,0) < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.v_sku, coalesce(li.v_qty,0), li.qty;
      elsif li.variant_id is null and li.p_qty < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
      end if;
    end if;
  end loop;

  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, null, coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.variant_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    if li.variant_id is not null then
      update public.variants set qty = greatest(0, qty - li.qty) where id = li.variant_id;
      update public.products
        set qty = greatest(0, coalesce((select sum(v.qty) from public.variants v where v.product_id = li.product_id), 0)),
            last_movement_at = now()
        where id = li.product_id;
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (li.product_id, li.variant_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    else
      update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
      insert into public.stock_adjustments(product_id, delta, source, kind)
      values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    end if;
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;
