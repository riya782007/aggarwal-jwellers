-- 0077 — Belt-and-braces: never abort a sale/purchase/return because of a zero stock movement.
-- Postgres check stock_adjustments_delta_nonzero rejects delta=0. Several RPCs and app
-- writes can still emit 0 (backorder, already-zero stock, no-op DIVA "set stock").
-- This BEFORE INSERT trigger silently skips those phantom rows so the surrounding
-- transaction (POS bill, estimate convert, wholesale commit, return) still commits.
-- Safe to re-run.

create or replace function public.trg_stock_adjustments_skip_zero()
returns trigger language plpgsql as $$
begin
  if new.delta is null or new.delta = 0 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_adjustments_skip_zero on public.stock_adjustments;
create trigger stock_adjustments_skip_zero
  before insert on public.stock_adjustments
  for each row execute procedure public.trg_stock_adjustments_skip_zero();

-- Wholesale payment-confirm: skip zero-qty lines (same class of error as POS).
create or replace function public.commit_wholesale_order(p_order uuid)
returns void language plpgsql as $$
declare o public.orders; li record; v_has_stock boolean; v_has_ledger boolean;
begin
  select * into o from public.orders where id = p_order;
  if o is null then raise exception 'Order % not found', p_order; end if;
  if o.channel <> 'wholesale' then return; end if;
  if o.payment_confirmed_at is not null then return; end if;
  if o.status in ('cancelled','void','refunded') then return; end if;

  select exists(select 1 from public.stock_adjustments where source = 'wholesale order ' || p_order) into v_has_stock;
  select exists(select 1 from public.ledger where kind = 'sales' and ref_id = p_order) into v_has_ledger;

  if not v_has_stock then
    for li in select oi.product_id, oi.qty, p.sku
                from public.order_items oi join public.products p on p.id = oi.product_id
               where oi.order_id = p_order loop
      if coalesce(li.qty, 0) = 0 then continue; end if;
      update public.products
         set qty = greatest(0, qty - li.qty), last_movement_at = now()
       where id = li.product_id;
      insert into public.stock_adjustments(product_id, sku, delta, source, kind)
      values (li.product_id, li.sku, -li.qty, 'wholesale order ' || p_order, 'sale');
    end loop;
  end if;

  if not v_has_ledger then
    insert into public.ledger(kind, ref_id, credit, note)
    values ('sales', p_order, o.total, 'wholesale order ' || p_order);
  end if;
end;
$$;
