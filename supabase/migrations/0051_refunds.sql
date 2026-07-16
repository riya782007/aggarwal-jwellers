-- Aggarwal Jewellers — 0051: Cash/bank refunds (closes the audit's top remaining risk).
-- ADDITIVE + IDEMPOTENT.
-- After a return or an over-collection, a bill can hold MORE money than its grand total
-- (they surface on v_overpaid_orders as "refund due"), but handing the money back had no
-- recording — cash-in-hand stayed overstated. record_refund reverses the tender correctly:
-- amount_paid and the pay_cash/pay_bank buckets come down, a day-book debit is posted, and
-- every downstream figure (cash book, Udhaar via order_grand_paise, dashboard) self-corrects.
create or replace function public.record_refund(p_order uuid, p_amount bigint, p_mode text default 'cash')
returns void language plpgsql security definer as $$
declare o record; v_over bigint; v_amt bigint; v_cash bigint; v_bank bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Refund must be positive'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  -- Refundable = what was collected beyond the grand total (net of returns). Clamped so a
  -- refund can never push the bill back into "due" by mistake.
  v_over := greatest(0, coalesce(o.amount_paid,0)
                        - public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0)));
  v_amt := least(p_amount, v_over);
  if v_amt <= 0 then raise exception 'Nothing refundable on this bill — it holds no excess money.'; end if;

  -- Reverse the tender bucket the money goes back through (fall over to the other bucket
  -- if the chosen one doesn't hold enough — e.g. paid by UPI, refunded in cash).
  if p_mode = 'cash' then
    v_cash := least(v_amt, coalesce(o.pay_cash,0)); v_bank := v_amt - v_cash;
  else
    v_bank := least(v_amt, coalesce(o.pay_bank,0)); v_cash := v_amt - v_bank;
  end if;
  update public.orders
    set amount_paid = greatest(0, coalesce(amount_paid,0) - v_amt),
        pay_cash = greatest(0, coalesce(pay_cash,0) - v_cash),
        pay_bank = greatest(0, coalesce(pay_bank,0) - v_bank)
    where id = p_order;
  if v_cash > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, v_cash, 'Refund to customer'); end if;
  if v_bank > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, v_bank, 'Refund to customer'); end if;
  insert into public.audit_log(actor, action, ref, detail)
  values ('staff', 'refund', p_order::text, 'Refunded ' || v_amt || 'p (' || coalesce(p_mode,'cash') || ')');
end; $$;
