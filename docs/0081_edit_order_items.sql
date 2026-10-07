-- 0081 — Edit a Final Estimate (cash bill) after it was saved: change a line's qty or rate,
-- remove a line, or add a new item — without cancelling the whole bill.
--
-- Owner request (Oct 2026): "agar final estimate me koi item add ya kam karna ho to ya to poora
-- cancel hota hai ya edit hi nahi hota — edit ka option chahiye."
--
-- One atomic call (row-locked on the order). Mirrors place_order / cancel_order exactly:
--   * stock: more pieces → deducted (refused when short unless p_allow_oversell); fewer / removed
--     → put back. Every movement is a stock_adjustments row (kind 'sale', ref_id = the order), so
--     Stock Movements and "units sold" stay true.
--   * bill: same order, same invoice number. Total = Σ lines + packing/courier/adjustment.
--   * money: if the new total is below what was already paid, the excess is refunded (cash first,
--     then bank) and posted to the day-book — exactly like cancel_order does. If the new total is
--     higher, the bill simply shows the balance due (collect it with "Record a payment").
--   * audit_log 'order_edited' + a short stamp in the staff-only note.
-- Only cash bills ('Final Estimate'), never cancelled ones, and not once a sales return exists
-- (those keep using Returns). GST tax invoices are untouched.
--
-- p_lines = the WHOLE bill as it should be after the edit:
--   [{ "item_id": "<existing order_items.id>", "qty": 3, "unit_price": 120000 },   -- keep / change
--    { "sku": "AJ1004-RED", "qty": 1, "unit_price": 95000 } ]                      -- new line
-- Existing lines left out are removed. unit_price is in paise (optional; default = current rate,
-- or the retail price for a new line).
-- Idempotent: safe to run more than once.

create or replace function public.edit_order_items(
  p_order uuid,
  p_lines jsonb,
  p_reason text default 'Bill edited',
  p_allow_oversell boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record; oi record; ln jsonb;
  prod public.products; var public.variants;
  v_keep uuid[] := '{}';
  v_id uuid; v_qty int; v_price bigint; v_old_ded int; v_new_ded int; v_need int; v_avail int; v_take int; v_back int;
  v_sku text; v_color text; v_mrp int;
  v_old_total bigint; v_items bigint; v_total bigint; v_grand bigint; v_paid bigint;
  v_refund bigint := 0; v_from_cash bigint := 0; v_from_bank bigint := 0;
  v_added int := 0; v_removed int := 0; v_changed int := 0; v_src text;
  v_why text := coalesce(nullif(trim(p_reason), ''), 'Bill edited');
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A bill needs at least one item. To remove everything, cancel the bill instead.';
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Bill not found.'; end if;
  if o.status in ('cancelled', 'void', 'refunded') then
    raise exception 'This bill is cancelled and cannot be edited.';
  end if;
  if coalesce(o.bill_type, 'gst') <> 'cash' then
    raise exception 'Only a Final Estimate can be edited. For a GST tax invoice use Returns.';
  end if;
  if coalesce(o.return_amount, 0) > 0
     or exists (select 1 from public.order_items where order_id = p_order and coalesce(returned_qty, 0) > 0) then
    raise exception 'This bill already has a sales return, so it cannot be edited. Use Returns instead.';
  end if;
  v_old_total := coalesce(o.total, 0);
  v_src := 'order ' || p_order || ' (bill edited)';

  -- 1) Lines that stay on the bill: change qty and/or rate, moving only the stock difference.
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_id := nullif(ln->>'item_id', '')::uuid;
    if v_id is null then continue; end if;
    if v_id = any(v_keep) then raise exception 'The same bill line was sent twice.'; end if;
    select * into oi from public.order_items where id = v_id and order_id = p_order for update;
    if not found then raise exception 'This bill was changed elsewhere — reload the page and try again.'; end if;
    v_keep := v_keep || v_id;

    v_qty := coalesce(nullif(ln->>'qty', '')::int, oi.qty);
    if v_qty < 1 then raise exception 'Quantity must be 1 or more — remove the line instead.'; end if;
    v_price := coalesce(nullif(ln->>'unit_price', '')::bigint, oi.unit_price);
    if v_price < 0 then raise exception 'Rate cannot be negative.'; end if;

    if oi.variant_id is not null then select upper(sku) into v_sku from public.variants where id = oi.variant_id;
    else select upper(sku) into v_sku from public.products where id = oi.product_id; end if;

    v_old_ded := coalesce(oi.deducted_qty, oi.qty);
    v_new_ded := v_old_ded;
    if v_qty > oi.qty then
      v_need := v_qty - oi.qty;
      if oi.variant_id is not null then select qty into v_avail from public.variants where id = oi.variant_id for update;
      else select qty into v_avail from public.products where id = oi.product_id for update; end if;
      v_avail := coalesce(v_avail, 0);
      if not p_allow_oversell and v_avail < v_need then
        raise exception 'Not enough stock for % — % available, % more needed.', v_sku, v_avail, v_need;
      end if;
      v_take := least(v_need, greatest(0, v_avail));
      if oi.variant_id is not null then
        update public.variants set qty = greatest(0, qty - v_need) where id = oi.variant_id;
        update public.products set qty = coalesce((select sum(qty) from public.variants where product_id = oi.product_id), 0), last_movement_at = now() where id = oi.product_id;
      else
        update public.products set qty = greatest(0, qty - v_need), last_movement_at = now() where id = oi.product_id;
      end if;
      v_new_ded := v_old_ded + v_take;
      insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
        values (oi.product_id, oi.variant_id, v_sku, -v_take, 'sale', v_src, v_why, p_order);
    elsif v_qty < oi.qty then
      v_new_ded := least(v_old_ded, v_qty);
      v_back := v_old_ded - v_new_ded;
      if v_back > 0 then
        if oi.variant_id is not null then
          update public.variants set qty = qty + v_back where id = oi.variant_id;
          update public.products set qty = coalesce((select sum(qty) from public.variants where product_id = oi.product_id), 0), last_movement_at = now() where id = oi.product_id;
        else
          update public.products set qty = qty + v_back, last_movement_at = now() where id = oi.product_id;
        end if;
        insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
          values (oi.product_id, oi.variant_id, v_sku, v_back, 'sale', v_src, v_why, p_order);
      end if;
    end if;

    if v_qty <> oi.qty or v_price <> oi.unit_price then
      update public.order_items
        set qty = v_qty, unit_price = v_price, line_total = v_price * v_qty, deducted_qty = v_new_ded
        where id = oi.id;
      v_changed := v_changed + 1;
    end if;
  end loop;

  -- 2) Lines left out: put their pieces back and drop them from the bill.
  for oi in
    select * from public.order_items where order_id = p_order and not (id = any(v_keep)) for update
  loop
    v_back := coalesce(oi.deducted_qty, oi.qty);
    if v_back > 0 then
      if oi.variant_id is not null then
        select upper(sku) into v_sku from public.variants where id = oi.variant_id;
        update public.variants set qty = qty + v_back where id = oi.variant_id;
        update public.products set qty = coalesce((select sum(qty) from public.variants where product_id = oi.product_id), 0), last_movement_at = now() where id = oi.product_id;
      else
        select upper(sku) into v_sku from public.products where id = oi.product_id;
        update public.products set qty = qty + v_back, last_movement_at = now() where id = oi.product_id;
      end if;
      insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
        values (oi.product_id, oi.variant_id, v_sku, v_back, 'sale', v_src, v_why, p_order);
    end if;
    delete from public.order_items where id = oi.id;
    v_removed := v_removed + 1;
  end loop;

  -- 3) New lines (same SKU resolution as place_order: product SKU, then variant SKU).
  for ln in select * from jsonb_array_elements(p_lines) loop
    if nullif(ln->>'item_id', '') is not null then continue; end if;
    v_qty := greatest(1, coalesce(nullif(ln->>'qty', '')::int, 1));
    prod := null; var := null;
    select * into prod from public.products where upper(sku) = upper(ln->>'sku') limit 1;
    if prod.id is null then
      select * into var from public.variants where upper(sku) = upper(ln->>'sku') limit 1;
      if var.id is not null then select * into prod from public.products where id = var.product_id limit 1; end if;
    end if;
    if prod.id is null then raise exception 'Item % not found.', ln->>'sku'; end if;
    if var.id is null then
      v_color := nullif(trim(coalesce(ln->>'color', '')), '');
      if v_color is not null then
        select * into var from public.variants where product_id = prod.id and lower(color) = lower(v_color) limit 1;
      end if;
    end if;
    v_sku := upper(coalesce(var.sku, prod.sku));
    if exists (select 1 from public.order_items where order_id = p_order and product_id = prod.id and variant_id is not distinct from var.id) then
      raise exception '% is already on this bill — change its quantity instead.', v_sku;
    end if;

    if var.id is not null then select qty into v_avail from public.variants where id = var.id for update;
    else select qty into v_avail from public.products where id = prod.id for update; end if;
    v_avail := coalesce(v_avail, 0);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed.', v_sku, v_avail, v_qty;
    end if;
    v_take := least(v_qty, greatest(0, v_avail));

    v_price := nullif(ln->>'unit_price', '')::bigint;
    if v_price is null then
      v_price := public.aj_tier_price(prod, 'retail');
      if var.id is not null then v_price := coalesce(var.retail_override, v_price); end if;
    end if;
    if v_price < 0 then raise exception 'Rate cannot be negative.'; end if;
    v_mrp := public.aj_tier_price(prod, 'mrp');

    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total, unit_mrp, deducted_qty)
      values (p_order, prod.id, var.id, v_qty, v_price, v_price * v_qty, v_mrp, v_take);

    if var.id is not null then
      update public.variants set qty = greatest(0, qty - v_qty) where id = var.id;
      update public.products set qty = coalesce((select sum(qty) from public.variants where product_id = prod.id), 0), last_movement_at = now() where id = prod.id;
    else
      update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    end if;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
      values (prod.id, var.id, v_sku, -v_take, 'sale', v_src, v_why, p_order);
    v_added := v_added + 1;
  end loop;

  if not exists (select 1 from public.order_items where order_id = p_order) then
    raise exception 'A bill needs at least one item. To remove everything, cancel the bill instead.';
  end if;

  -- 4) New total (lines + itemised charges), day-book difference, and any refund.
  select coalesce(sum(line_total), 0) into v_items from public.order_items where order_id = p_order;
  v_total := v_items + coalesce(o.extra_packing, 0) + coalesce(o.extra_courier, 0) + coalesce(o.extra_adjustment, 0);
  v_paid := coalesce(o.amount_paid, 0);

  if v_total > v_old_total then
    insert into public.ledger(kind, ref_id, credit, note) values ('sales', p_order, v_total - v_old_total, 'Bill edited: ' || v_why);
  elsif v_total < v_old_total then
    insert into public.ledger(kind, ref_id, debit, note) values ('sales', p_order, v_old_total - v_total, 'Bill edited: ' || v_why);
  end if;

  -- A cash bill's paid amount can never exceed its total (trg_cap_amount_paid). Refund the excess
  -- explicitly so the cash / bank books come down too — cash first, then bank.
  v_refund := greatest(0, v_paid - greatest(0, v_total));
  if v_refund > 0 then
    v_from_cash := least(v_refund, coalesce(o.pay_cash, 0));
    v_from_bank := least(v_refund - v_from_cash, coalesce(o.pay_bank, 0));
    if v_from_cash > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, v_from_cash, 'Refund on bill edit'); end if;
    if v_from_bank > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, v_from_bank, 'Refund on bill edit'); end if;
  end if;

  update public.orders
    set total = v_total,
        amount_paid = v_paid - v_refund,
        pay_cash = greatest(0, coalesce(pay_cash, 0) - v_from_cash),
        pay_bank = greatest(0, coalesce(pay_bank, 0) - v_from_bank),
        admin_note = trim(coalesce(admin_note, '') || ' [Edited ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ': ' || v_why || ']')
    where id = p_order;

  v_grand := public.order_grand_paise(v_total, o.bill_type, o.gst_mode, 0);
  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'order_edited', p_order::text,
            v_why || ' · ' || v_added || ' added, ' || v_removed || ' removed, ' || v_changed || ' changed · total '
            || v_old_total || 'p → ' || v_total || 'p · refund ' || v_refund || 'p');

  return jsonb_build_object(
    'ok', true, 'old_total', v_old_total, 'total', v_total, 'grand', v_grand,
    'paid', v_paid - v_refund, 'due', greatest(0, v_grand - (v_paid - v_refund)), 'refund', v_refund,
    'added', v_added, 'removed', v_removed, 'changed', v_changed);
end; $$;
