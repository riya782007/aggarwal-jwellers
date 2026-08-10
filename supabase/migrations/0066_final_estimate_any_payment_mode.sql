-- A non-GST "Final Estimate" (bill_type='cash') is NOT cash-only. Two fixes:
-- 1) Billing an estimate no longer assumes cash — the bill is created UNPAID with no mode.
-- 2) Recording a payment stamps the real tender (cash / upi / bank / split) onto payment_mode,
--    so a Final Estimate paid by UPI/bank shows and books correctly.
-- (The POS path already sets payment_mode from the chosen payment methods, for any bill type.)

CREATE OR REPLACE FUNCTION public.convert_estimate_v2(p_estimate_id uuid, p_bill_type text DEFAULT 'cash'::text, p_allow_oversell boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  est public.estimates; li record;
  v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  for li in select ei.*, p.sku as p_sku, p.qty as p_qty
            from public.estimate_items ei join public.products p on p.id = ei.product_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell and li.p_qty < li.qty then
      raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
    end if;
  end loop;

  -- payment_mode = NULL: the mode is unknown until the actual payment is recorded (any mode).
  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, null, coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
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
end; $function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_order uuid, p_amount bigint, p_mode text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare o record; v_due bigint; v_amt bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be positive'; end if;
  select total, bill_type, gst_mode, coalesce(return_amount,0) as return_amount,
         coalesce(amount_paid,0) as amount_paid
    into o from public.orders where id = p_order for update;
  if not found then raise exception 'Unknown order %', p_order; end if;
  v_due := greatest(0, public.order_grand_paise(o.total, o.bill_type, o.gst_mode, o.return_amount) - o.amount_paid);
  v_amt := least(p_amount, v_due);
  if v_amt <= 0 then raise exception 'Bill already settled — nothing due.'; end if;
  update public.orders
    set amount_paid = coalesce(amount_paid,0) + v_amt,
        pay_cash = coalesce(pay_cash,0) + case when p_mode = 'cash' then v_amt else 0 end,
        pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end,
        -- Stamp the tender onto the bill so a non-GST bill reflects UPI/bank/split, not just cash.
        payment_mode = case
          when (coalesce(pay_cash,0) + case when p_mode = 'cash' then v_amt else 0 end) > 0
           and (coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end) > 0 then 'split'
          when (coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end) > 0 then p_mode
          else 'cash' end
    where id = p_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
          p_order, v_amt, 'payment ' || coalesce(p_mode,'cash'));
end; $function$;
