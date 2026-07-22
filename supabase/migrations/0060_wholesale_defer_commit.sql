-- 0060 — Wholesale: don't touch stock or revenue until the owner confirms UPI payment.
--
-- Before this, place_wholesale_order() decremented stock AND booked a sales-ledger credit the
-- instant a dealer placed an order — so an unpaid order both reduced inventory and inflated
-- revenue. With the QR pay-first flow (0059) that's wrong: nothing should be committed until the
-- owner confirms the money landed.
--
-- New shape:
--   place_wholesale_order  → creates the order (status 'pending') + items + total ONLY.
--                            Pre-validates stock (so an unfulfillable order can't be placed) but
--                            does NOT decrement it and does NOT post to the ledger.
--   commit_wholesale_order → run at "Payment received": decrements stock, writes the stock ledger,
--                            and books the sales-ledger credit. Idempotent via payment_confirmed_at.
--
-- An order is only counted as a real sale (revenue / receivables) once payment_confirmed_at is set;
-- the app layer enforces that via isCountableSale() (channel='wholesale' && payment_confirmed_at null
-- ⇒ not yet counted). Rejecting an uncommitted order must NOT restore stock (none was taken) — the
-- app guards that too.

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

  -- pre-validate stock + compute total (NO decrement here)
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

  -- items only — stock + ledger are deferred to commit_wholesale_order()
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    v_price := public.aj_tier_price(prod, 'wholesale');
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, v_qty, v_price, v_price * v_qty, public.aj_tier_price(prod, 'mrp'));
  end loop;

  update public.orders set total = v_total where id = v_order;
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- Commit an awaiting-payment wholesale order: decrement stock, write stock ledger, book revenue.
-- Called once, at the owner's "Payment received" confirmation. Oversell is allowed here because the
-- money has already been received — the order must go through (stock clamps at 0). Idempotent: if the
-- order is already payment-confirmed, it does nothing.
create or replace function public.commit_wholesale_order(p_order uuid)
returns void language plpgsql as $$
declare o public.orders; li record; v_has_stock boolean; v_has_ledger boolean;
begin
  select * into o from public.orders where id = p_order;
  if o is null then raise exception 'Order % not found', p_order; end if;
  if o.channel <> 'wholesale' then return; end if;
  if o.payment_confirmed_at is not null then return; end if; -- already committed
  if o.status in ('cancelled','void','refunded') then return; end if;

  -- Idempotency guards. A wholesale order placed BEFORE this migration already moved stock and
  -- booked revenue at placement — committing it again would double-count. So only move stock / book
  -- the ledger if this order hasn't already done so.
  select exists(select 1 from public.stock_adjustments where source = 'wholesale order ' || p_order) into v_has_stock;
  select exists(select 1 from public.ledger where kind = 'sales' and ref_id = p_order) into v_has_ledger;

  if not v_has_stock then
    for li in select oi.product_id, oi.qty, p.sku
                from public.order_items oi join public.products p on p.id = oi.product_id
               where oi.order_id = p_order loop
      update public.products
         set qty = greatest(0, qty - li.qty), last_movement_at = now()
       where id = li.product_id;
      insert into public.stock_adjustments(product_id, sku, delta, source, kind)
      values (li.product_id, li.sku, -li.qty, 'wholesale order ' || p_order, 'sale');
    end loop;
  end if;

  if not v_has_ledger then
    -- Book the sale at the order's final (tier-discounted) total.
    insert into public.ledger(kind, ref_id, credit, note)
    values ('sales', p_order, o.total, 'wholesale order ' || p_order);
  end if;
end; $$;
