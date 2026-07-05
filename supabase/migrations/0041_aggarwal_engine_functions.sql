-- ============================================================
-- PART 10 — Aggarwal billing engine: all database functions
-- Authored from the app's contracts. Run LAST (after Parts 1-9).
-- All money is integer paise. All functions are idempotent
-- (CREATE OR REPLACE) — safe to re-run.
-- ============================================================

-- ---------- Indian financial year, e.g. '26-27' ----------
create or replace function public.current_indian_fy(p_at timestamptz default now())
returns text language sql stable as $$
  select case
    when extract(month from p_at at time zone 'Asia/Kolkata') >= 4
      then to_char(p_at at time zone 'Asia/Kolkata', 'YY') || '-' ||
           to_char((p_at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((p_at at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
         to_char(p_at at time zone 'Asia/Kolkata', 'YY')
  end;
$$;

-- ---------- Tier price for a product row (overrides win, else bd_price formula) ----------
create or replace function public.aj_tier_price(p_product public.products, p_tier text)
returns integer language plpgsql stable as $$
begin
  if p_tier = 'wholesale' then
    return coalesce(p_product.wholesale_override, public.bd_price(p_product.base_wholesale, 'wholesale'));
  elsif p_tier = 'mrp' then
    return coalesce(p_product.mrp_override, public.bd_price(p_product.base_wholesale, 'mrp'));
  else
    return coalesce(p_product.retail_override, public.bd_price(p_product.base_wholesale, 'retail'));
  end if;
end; $$;

-- ---------- Sequential GST-style invoice number: AJ/26-27/0001 ----------
create or replace function public.assign_invoice_no(p_order uuid)
returns text language plpgsql as $$
declare ds record; v_fy text; v_no text; v_existing text;
begin
  select invoice_no into v_existing from public.orders where id = p_order;
  if v_existing is not null then return v_existing; end if;
  v_fy := public.current_indian_fy(now());
  select * into ds from public.doc_settings where id = 1 for update;
  if ds is null then
    insert into public.doc_settings(id) values (1) returning * into ds;
  end if;
  if ds.fy is distinct from v_fy then
    update public.doc_settings set fy = v_fy, next_invoice_no = 1 where id = 1;
    ds.next_invoice_no := 1;
  end if;
  v_no := coalesce(ds.invoice_prefix,'AJ') || '/' || v_fy || '/' || lpad(ds.next_invoice_no::text, 4, '0');
  update public.doc_settings set next_invoice_no = ds.next_invoice_no + 1 where id = 1;
  update public.orders set invoice_no = v_no where id = p_order;
  return v_no;
end; $$;

-- ---------- Find-or-create a customer from {name, phone} ----------
create or replace function public.aj_upsert_customer(p_customer jsonb)
returns uuid language plpgsql as $$
declare v_id uuid; v_name text; v_phone text;
begin
  v_name  := nullif(trim(coalesce(p_customer->>'name','')), '');
  v_phone := nullif(trim(coalesce(p_customer->>'phone','')), '');
  if v_name is null and v_phone is null then return null; end if;
  if v_phone is not null then
    select id into v_id from public.customers where phone = v_phone limit 1;
  end if;
  if v_id is null and v_name is not null then
    select id into v_id from public.customers where lower(name) = lower(v_name) limit 1;
  end if;
  if v_id is null then
    insert into public.customers(name, phone) values (v_name, v_phone) returning id into v_id;
  end if;
  return v_id;
end; $$;

-- ---------- place_order: the counter/online sale ----------
create or replace function public.place_order(
  p_items jsonb,
  p_customer jsonb default '{}'::jsonb,
  p_channel text default 'pos',
  p_payment text default 'cash',
  p_allow_oversell boolean default false,
  p_tier text default 'retail'
) returns jsonb language plpgsql as $$
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
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then
      raise exception 'Product % not found', it->>'sku';
    end if;

    var := null;
    v_color := nullif(trim(coalesce(it->>'color','')), '');
    if v_color is not null then
      select * into var from public.variants
      where product_id = prod.id and lower(color) = lower(v_color) limit 1;
    end if;

    v_avail := coalesce(var.qty, prod.qty);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed', prod.sku, v_avail, v_qty;
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
    values (prod.id, var.id, prod.sku, -v_qty, 'order ' || v_order, 'sale');
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
end; $$;

-- ---------- place_wholesale_order: trade-portal order by an approved party ----------
create or replace function public.place_wholesale_order(
  p_customer uuid,
  p_items jsonb,
  p_allow_oversell boolean default false
) returns jsonb language plpgsql as $$
declare
  cust public.customers; it jsonb; prod public.products;
  v_order uuid; v_qty int; v_price int; v_total bigint := 0; v_min bigint;
begin
  select * into cust from public.customers where id = p_customer;
  if cust is null or not (cust.type = 'wholesale' or cust.wholesale_approved) then
    raise exception 'Not an approved wholesale party';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in the order';
  end if;

  -- pre-validate stock + compute total
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    if not p_allow_oversell and prod.qty < v_qty then
      raise exception 'Not enough stock for % — % available, % ordered', prod.sku, prod.qty, v_qty;
    end if;
    v_total := v_total + (public.aj_tier_price(prod, 'wholesale')::bigint * v_qty);
  end loop;

  select coalesce(wholesale_min_order, 300000) into v_min from public.pricing_settings limit 1;
  if v_total < coalesce(v_min, 300000) then
    raise exception 'Minimum wholesale order is Rs %', (coalesce(v_min,300000) / 100);
  end if;

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone)
  values ('wholesale', 'pending', 0, 'credit', cust.id, cust.name, cust.phone)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    v_price := public.aj_tier_price(prod, 'wholesale');
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, v_qty, v_price, v_price * v_qty, public.aj_tier_price(prod, 'mrp'));
    update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    insert into public.stock_adjustments(product_id, sku, delta, source, kind)
    values (prod.id, prod.sku, -v_qty, 'wholesale order ' || v_order, 'sale');
  end loop;

  update public.orders set total = v_total where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'wholesale order ' || v_order);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- ---------- create_estimate: quote at retail prices, NO stock movement ----------
create or replace function public.create_estimate(p_items jsonb, p_customer jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; prod public.products; v_est uuid; v_qty int; v_price int; v_total bigint := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items on the estimate';
  end if;
  insert into public.estimates(customer_name, customer_phone, total, status)
  values (nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0, 'open')
  returning id into v_est;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    v_price := public.aj_tier_price(prod, 'retail');
    insert into public.estimate_items(estimate_id, product_id, qty, unit_price, line_total)
    values (v_est, prod.id, v_qty, v_price, v_price * v_qty);
    v_total := v_total + (v_price::bigint * v_qty);
  end loop;
  update public.estimates set total = v_total where id = v_est;
  return jsonb_build_object('estimate_id', v_est, 'total', v_total);
end; $$;

-- ---------- convert_estimate_v2: bill an estimate (atomic, stock-guarded) ----------
create or replace function public.convert_estimate_v2(
  p_estimate_id uuid,
  p_bill_type text default 'cash',
  p_allow_oversell boolean default false
) returns jsonb language plpgsql as $$
declare
  est public.estimates; li record; prod public.products;
  v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  -- pre-validate every line before touching stock
  for li in select ei.*, p.sku as p_sku, p.qty as p_qty
            from public.estimate_items ei join public.products p on p.id = ei.product_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell and li.p_qty < li.qty then
      raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
    end if;
  end loop;

  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, 'cash', coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
    insert into public.stock_adjustments(product_id, delta, source, kind)
    values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- legacy single-arg form used by convertEstimateAction
create or replace function public.convert_estimate(p_estimate_id uuid)
returns jsonb language plpgsql as $$
begin
  return public.convert_estimate_v2(p_estimate_id, 'cash', false);
end; $$;

-- ---------- record_purchase: goods-in, per line, variant-aware ----------
create or replace function public.record_purchase(p_supplier_id uuid, p_bill_no text, p_items jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; v_purchase uuid; v_total bigint := 0; v_qty int; v_cost int;
        v_pid uuid; v_vid uuid; v_sku text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No purchase lines';
  end if;
  insert into public.purchases(supplier_id, bill_no, total) values (p_supplier_id, p_bill_no, 0)
  returning id into v_purchase;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := greatest(1, coalesce((it->>'qty')::int, 1));
    v_cost := greatest(0, coalesce((it->>'unit_cost')::int, 0));
    v_pid  := nullif(it->>'mapped_product_id','')::uuid;
    v_vid  := nullif(it->>'variant_id','')::uuid;
    v_sku  := nullif(trim(coalesce(it->>'supplier_sku','')), '');

    insert into public.purchase_items(purchase_id, supplier_sku, mapped_product_id, variant_id, qty, unit_cost)
    values (v_purchase, v_sku, v_pid, v_vid, v_qty, v_cost);
    v_total := v_total + (v_cost::bigint * v_qty);

    if v_vid is not null then
      update public.variants set qty = qty + v_qty where id = v_vid;
      update public.products p
        set qty = greatest(0, coalesce((select sum(qty) from public.variants v where v.product_id = p.id), 0)),
            last_movement_at = now()
        where id = (select product_id from public.variants where id = v_vid);
    elsif v_pid is not null then
      update public.products set qty = qty + v_qty, last_movement_at = now() where id = v_pid;
    end if;
    if v_pid is not null or v_vid is not null then
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (coalesce(v_pid, (select product_id from public.variants where id = v_vid)), v_vid, v_qty, 'purchase ' || v_purchase, 'purchase');
    end if;
  end loop;

  update public.purchases set total = v_total where id = v_purchase;
  insert into public.ledger(kind, ref_id, debit, note) values ('purchase', v_purchase, v_total, 'purchase bill ' || coalesce(p_bill_no,''));
  return jsonb_build_object('purchase_id', v_purchase, 'total', v_total);
end; $$;

-- ---------- delete_purchase: reverse the stock, then remove the bill ----------
create or replace function public.delete_purchase(p_id uuid)
returns void language plpgsql as $$
declare li record;
begin
  for li in select * from public.purchase_items where purchase_id = p_id loop
    if li.variant_id is not null then
      update public.variants set qty = greatest(0, qty - li.qty) where id = li.variant_id;
      update public.products p
        set qty = greatest(0, coalesce((select sum(qty) from public.variants v where v.product_id = p.id), 0))
        where id = (select product_id from public.variants where id = li.variant_id);
    elsif li.mapped_product_id is not null then
      update public.products set qty = greatest(0, qty - li.qty) where id = li.mapped_product_id;
    end if;
    if li.mapped_product_id is not null or li.variant_id is not null then
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (coalesce(li.mapped_product_id, (select product_id from public.variants where id = li.variant_id)), li.variant_id, -li.qty, 'purchase ' || p_id || ' deleted', 'correction');
    end if;
  end loop;
  delete from public.purchase_items where purchase_id = p_id;
  delete from public.purchases where id = p_id;
end; $$;

-- ---------- record_payment: receive money against a bill ----------
create or replace function public.record_payment(p_order uuid, p_amount bigint, p_mode text default 'cash')
returns void language plpgsql as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be positive'; end if;
  update public.orders
    set amount_paid = coalesce(amount_paid,0) + p_amount,
        pay_cash = coalesce(pay_cash,0) + case when p_mode = 'cash' then p_amount else 0 end,
        pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then p_amount else 0 end
    where id = p_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values (case when p_mode = 'cash' then 'cash' else 'bank' end, p_order, p_amount, 'payment ' || p_mode);
end; $$;

-- ---------- cash_bank_summary: cash book headline numbers ----------
create or replace function public.cash_bank_summary()
returns table(opening_cash bigint, opening_bank bigint, cash_in bigint, bank_in bigint, cash_out bigint, bank_out bigint)
language sql stable as $$
  select
    (select coalesce(opening_cash,0) from public.doc_settings where id = 1),
    (select coalesce(opening_bank,0) from public.doc_settings where id = 1),
    (select coalesce(sum(pay_cash),0) from public.orders),
    (select coalesce(sum(pay_bank),0) from public.orders),
    (select coalesce(sum(amount),0) from public.supplier_payments where mode = 'cash'),
    (select coalesce(sum(amount),0) from public.supplier_payments where coalesce(mode,'bank') <> 'cash');
$$;
