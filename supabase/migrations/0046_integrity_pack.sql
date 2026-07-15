-- Aggarwal Jewellers — 0046: Integrity pack (features studied from the reference build,
-- implemented NATIVELY on Aggarwal's engine — order_grand_paise/return_amount from 0045
-- stay the single source of truth; nothing was copied).
-- ADDITIVE + IDEMPOTENT. Contents:
--   1) Per-line return caps  — order_items.returned_qty (+backfill); a line's return window
--      closes when sold − returned is exhausted (no double returns).
--   2) record_sales_return v3 — cap-aware, VARIANT-CORRECT line pricing (the old body priced
--      every return off the first matching product line), keeps 0045's orders.return_amount.
--   3) cancel_order — restock net-of-returns, day-book reversal, tender refund reversal,
--      status='cancelled'; idempotent; feeds every downstream (Udhaar, cashbook, dashboard
--      already exclude dead statuses per 0045).
--   4) Purchase returns — record_purchase_return RPC (per-line caps, stock-availability guard,
--      debit note on purchases.return_amount) + payables everywhere become net of returns.
--   5) Variant qty = source of truth — trigger keeps product.qty ≡ Σ variants + one-time heal.

-- 1) Per-line sales-return caps ---------------------------------------------------------------
alter table public.order_items add column if not exists returned_qty int not null default 0;

update public.order_items oi
set returned_qty = least(oi.qty, agg.rqty)
from (
  select sa.ref_id as order_id, sa.product_id, sa.variant_id, sum(sa.delta)::int as rqty
  from public.stock_adjustments sa
  where sa.kind = 'return' and sa.delta > 0 and sa.ref_id is not null
  group by sa.ref_id, sa.product_id, sa.variant_id
) agg
where oi.order_id = agg.order_id and oi.product_id = agg.product_id
  and oi.variant_id is not distinct from agg.variant_id
  and coalesce(oi.returned_qty, 0) = 0;

-- 2) record_sales_return v3 -------------------------------------------------------------------
create or replace function public.record_sales_return(p_order_id uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer as $function$
declare v_id uuid := uuid_generate_v4(); it jsonb; v_qty int := 0; v_amt bigint := 0; v_bal int;
        v_prod uuid; v_variant uuid; v_iqty int; v_apply int; v_sku text; v_vid uuid;
        oi record; o record; v_found boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','void','refunded') then raise exception 'Bill is cancelled — nothing to return.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := (it->>'product_id')::uuid;
    v_variant := nullif(it->>'variant_id','')::uuid;
    v_iqty := coalesce((it->>'qty')::int, 0);
    if v_iqty <= 0 then continue; end if;

    -- The exact bill line (product + variant); legacy calls without a variant fall back to
    -- the product's line with the most remaining window.
    select * into oi from public.order_items
      where order_id = p_order_id and product_id = v_prod and variant_id is not distinct from v_variant
      limit 1 for update;
    v_found := found;
    if not v_found then
      select * into oi from public.order_items
        where order_id = p_order_id and product_id = v_prod
        order by (qty - coalesce(returned_qty,0)) desc limit 1 for update;
      v_found := found;
    end if;
    if not v_found then continue; end if;

    v_apply := least(v_iqty, greatest(0, oi.qty - coalesce(oi.returned_qty, 0)));   -- CAP
    if v_apply <= 0 then continue; end if;
    update public.order_items set returned_qty = coalesce(returned_qty,0) + v_apply where id = oi.id;

    v_vid := coalesce(v_variant, oi.variant_id);
    if v_vid is not null then
      update public.variants set qty = qty + v_apply where id = v_vid;
      update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = v_prod), last_movement_at = now() where id = v_prod;
      select upper(sku) into v_sku from public.variants where id = v_vid;
    else
      update public.products set qty = qty + v_apply, last_movement_at = now() where id = v_prod;
      select upper(sku) into v_sku from public.products where id = v_prod;
    end if;

    v_qty := v_qty + v_apply;
    v_amt := v_amt + coalesce(oi.unit_price, 0)::bigint * v_apply;  -- THAT line's billed rate
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id, created_at)
      values (v_prod, v_vid, v_sku, v_apply, 'return', 'Sales return', coalesce(nullif(p_reason,''),'Returned'), p_order_id, now());
  end loop;

  if v_qty = 0 then raise exception 'Nothing returnable — these lines are already fully returned.'; end if;

  insert into public.returns(id, kind, ref_order_id, reason, qty, created_at) values (v_id, 'sales', p_order_id, p_reason, v_qty, now());
  select coalesce(max(balance),0) into v_bal from public.ledger;
  insert into public.ledger(kind, ref_id, debit, credit, balance, note, created_at)
    values ('sales', v_id, v_amt, 0, v_bal - v_amt, concat('Sales return: ', p_reason), now());
  -- 0045 mechanism: the returned value reduces this bill's receivable everywhere.
  update public.orders set return_amount = coalesce(return_amount,0) + v_amt where id = p_order_id;
  insert into public.audit_log(actor, action, ref, detail)
    values ('staff','sales_return', v_id::text, coalesce(p_reason,'') || ' · ' || v_qty || ' pcs · ' || v_amt || 'p');
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $function$;

-- 3) cancel_order -------------------------------------------------------------------------------
create or replace function public.cancel_order(p_order uuid, p_reason text default 'Cancelled')
returns jsonb language plpgsql security definer as $$
declare o record; it record; v_restock int; v_restocked int := 0; v_refund bigint := 0;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','void','refunded') then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;

  -- Restock every line NET of pieces already returned (those are back in stock already).
  for it in
    select oi.*, upper(p.sku) as psku from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order
  loop
    v_restock := greatest(0, it.qty - coalesce(it.returned_qty, 0));
    if v_restock > 0 then
      if it.variant_id is not null then
        update public.variants set qty = qty + v_restock where id = it.variant_id;
        update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = it.product_id), last_movement_at = now() where id = it.product_id;
      else
        update public.products set qty = qty + v_restock, last_movement_at = now() where id = it.product_id;
      end if;
      insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
        values (it.product_id, it.variant_id, it.psku, v_restock, 'cancel', 'order ' || p_order || ' cancelled', coalesce(nullif(p_reason,''),'Cancelled'), p_order);
      v_restocked := v_restocked + v_restock;
    end if;
  end loop;

  -- Day-book: reverse the sale value that hasn't already been reversed by return credits.
  insert into public.ledger(kind, ref_id, debit, note)
    values ('sales', p_order, greatest(0, coalesce(o.total,0) - coalesce(o.return_amount,0)), 'Order cancelled: ' || coalesce(nullif(p_reason,''),'-'));
  -- Money back: reverse the recorded tender so cash-in-hand / bank books stay true.
  if coalesce(o.pay_cash,0) > 0 then
    insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, o.pay_cash, 'Refund on cancel');
  end if;
  if coalesce(o.pay_bank,0) > 0 then
    insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, o.pay_bank, 'Refund on cancel');
  end if;
  v_refund := coalesce(o.pay_cash,0) + coalesce(o.pay_bank,0);

  update public.orders
    set status = 'cancelled', amount_paid = 0, pay_cash = 0, pay_bank = 0,
        admin_note = trim(coalesce(admin_note,'') || ' [Cancelled: ' || coalesce(nullif(p_reason,''),'-') || ']')
    where id = p_order;

  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'order_cancelled', p_order::text,
            coalesce(p_reason,'Cancelled') || ' · restocked ' || v_restocked || ' pcs · refund reversed ' || v_refund || 'p');
  return jsonb_build_object('ok', true, 'restocked', v_restocked, 'refund', v_refund);
end; $$;

-- 4) Purchase returns ---------------------------------------------------------------------------
alter table public.purchases add column if not exists return_amount bigint not null default 0;
alter table public.purchase_items add column if not exists returned_qty int not null default 0;

create or replace function public.record_purchase_return(p_purchase uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer as $$
declare v_id uuid := uuid_generate_v4(); it jsonb; v_qty int := 0; v_amt bigint := 0;
        li record; v_apply int; v_stock int; v_sku text;
begin
  perform 1 from public.purchases where id = p_purchase for update;
  if not found then raise exception 'Purchase not found'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into li from public.purchase_items
      where id = (it->>'purchase_item_id')::uuid and purchase_id = p_purchase for update;
    if not found then continue; end if;
    v_apply := least(coalesce((it->>'qty')::int, 0), greatest(0, li.qty - coalesce(li.returned_qty, 0)));  -- CAP
    if v_apply <= 0 then continue; end if;
    if li.mapped_product_id is null then raise exception 'Line is not mapped to a product — map it before returning.'; end if;

    -- The pieces must physically be in stock to hand back to the supplier.
    if li.variant_id is not null then
      select qty, upper(sku) into v_stock, v_sku from public.variants where id = li.variant_id;
    else
      select qty, upper(sku) into v_stock, v_sku from public.products where id = li.mapped_product_id;
    end if;
    if coalesce(v_stock, 0) < v_apply then
      raise exception 'Only % in stock for % — cannot return % to the supplier.', coalesce(v_stock,0), v_sku, v_apply;
    end if;

    if li.variant_id is not null then
      update public.variants set qty = qty - v_apply where id = li.variant_id;
      update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = li.mapped_product_id), last_movement_at = now() where id = li.mapped_product_id;
    else
      update public.products set qty = qty - v_apply, last_movement_at = now() where id = li.mapped_product_id;
    end if;
    update public.purchase_items set returned_qty = coalesce(returned_qty,0) + v_apply where id = li.id;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
      values (li.mapped_product_id, li.variant_id, v_sku, -v_apply, 'purchase_return', 'Purchase return ' || p_purchase, coalesce(nullif(p_reason,''),'Returned to supplier'), p_purchase);
    v_qty := v_qty + v_apply;
    v_amt := v_amt + coalesce(li.unit_cost, 0)::bigint * v_apply;
  end loop;

  if v_qty = 0 then raise exception 'Nothing returnable on this bill (lines already fully returned).'; end if;

  insert into public.returns(id, kind, ref_purchase_id, reason, qty) values (v_id, 'purchase', p_purchase, p_reason, v_qty);
  update public.purchases set return_amount = coalesce(return_amount,0) + v_amt where id = p_purchase;   -- debit note
  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'purchase_return', v_id::text, coalesce(p_reason,'') || ' · ' || v_qty || ' pcs · debit note ' || v_amt || 'p');
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $$;

-- Payables become NET of purchase-return debit notes.
create or replace view public.v_accounting_health as
select
  (select count(*) from v_inventory_reconciliation) as inventory_drift_products,
  (select count(*) from v_overpaid_orders) as overpaid_orders,
  (select count(*) from products where coalesce(qty,0) < 0) as negative_stock,
  (select count(*) from stock_adjustments where ref_id is null and kind in ('sale','purchase','return','estimate')) as movements_without_source,
  (select coalesce(sum(greatest(0, public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
                                   - coalesce(amount_paid,0))),0)
     from orders where status not in ('cancelled','void','refunded')) as receivable_paise,
  (select coalesce(sum(p.total - coalesce(p.return_amount,0)),0)
          - coalesce((select sum(amount) from supplier_payments),0) from purchases p) as payable_paise;

-- 5) Variant quantities are the source of truth --------------------------------------------------
create or replace function public.sync_product_qty_from_variants() returns trigger
language plpgsql as $$
declare v_pid uuid := coalesce(new.product_id, old.product_id); v_sum int;
begin
  if v_pid is not null then
    select coalesce(sum(qty), 0) into v_sum from public.variants where product_id = v_pid;
    if found and exists (select 1 from public.variants where product_id = v_pid) then
      update public.products set qty = v_sum where id = v_pid and qty is distinct from v_sum;
    end if;
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_sync_product_qty on public.variants;
create trigger trg_sync_product_qty
after insert or delete or update of qty on public.variants
for each row execute function public.sync_product_qty_from_variants();

-- One-time heal: align every varianted product's total to Σ its variants.
update public.products p set qty = v.sum_qty
from (select product_id, coalesce(sum(qty),0) as sum_qty from public.variants group by product_id) v
where p.id = v.product_id and p.qty <> v.sum_qty;
