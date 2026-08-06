-- FIX: POS billing failed with "Product <sku> not found" whenever a VARIANT SKU (e.g. AJSIGDE391-26)
-- was billed. place_order only looked up the products table by sku, then expected a separate 'color'
-- field to pick the variant. But the counter bills by the code printed on the label — which is the
-- VARIANT sku — with no colour. So the lookup missed and threw.
--
-- Now place_order resolves the billed sku as a product FIRST; if that misses, it treats the sku as a
-- variant sku and loads its parent product. The legacy "product sku + color" path still works. Stock
-- decrements per-variant exactly as before.
CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'pos'::text, p_payment text DEFAULT 'cash'::text, p_allow_oversell boolean DEFAULT false, p_tier text DEFAULT 'retail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  it jsonb; prod public.products; var public.variants;
  v_order uuid; v_customer uuid; v_qty int; v_price int; v_mrp int; v_total bigint := 0;
  v_color text; v_avail int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to bill';
  end if;
  v_customer := public.aj_upsert_customer(p_customer);

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone, amount_paid)
  values (p_channel::order_channel, 'completed', 0, p_payment, v_customer,
          nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));

    -- Resolve the billed SKU: PRODUCT first, else treat it as a VARIANT sku and load its parent.
    var := null;
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then
      select * into var from public.variants where upper(sku) = upper(it->>'sku') limit 1;
      if var.id is not null then
        select * into prod from public.products where id = var.product_id limit 1;
      end if;
    end if;
    if prod is null then
      raise exception 'Product % not found', it->>'sku';
    end if;

    -- Legacy: product sku + explicit colour resolves the variant by colour.
    if var.id is null then
      v_color := nullif(trim(coalesce(it->>'color','')), '');
      if v_color is not null then
        select * into var from public.variants
        where product_id = prod.id and lower(color) = lower(v_color) limit 1;
      end if;
    end if;

    v_avail := coalesce(var.qty, prod.qty);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed', coalesce(var.sku, prod.sku), v_avail, v_qty;
    end if;

    v_price := public.aj_tier_price(prod, p_tier);
    if var.id is not null then
      v_price := case p_tier
        when 'wholesale' then coalesce(var.wholesale_override, v_price)
        else coalesce(var.retail_override, v_price) end;
    end if;
    v_mrp := public.aj_tier_price(prod, 'mrp');

    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, var.id, v_qty, v_price, v_price * v_qty, v_mrp);
    v_total := v_total + (v_price::bigint * v_qty);

    if var.id is not null then
      update public.variants set qty = greatest(0, qty - v_qty) where id = var.id;
      update public.products
        set qty = greatest(0, coalesce((select sum(qty) from public.variants where product_id = prod.id), 0)),
            last_movement_at = now()
        where id = prod.id;
    else
      update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    end if;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, source, kind)
    values (prod.id, var.id, coalesce(var.sku, prod.sku), -v_qty, 'order ' || v_order, 'sale');
  end loop;

  update public.orders
    set total = v_total,
        amount_paid = case when p_payment in ('cash','upi','online','bank') then v_total else 0 end,
        pay_cash = case when p_payment = 'cash' then v_total else 0 end,
        pay_bank = case when p_payment in ('upi','online','bank') then v_total else 0 end
    where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ('sales', v_order, v_total, 'order ' || v_order);

  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $function$;
