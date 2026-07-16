-- Aggarwal Jewellers — 0053: fix "column kind is of type ledger_kind but expression is of type text".
-- QA (16 Jul) caught that NO payment could be recorded: record_payment and record_party_payment
-- insert into ledger with `case when p_mode='cash' then 'cash' else 'bank' end`, and a CASE of two
-- string literals resolves to TEXT, which Postgres will not implicitly cast to the ledger_kind enum
-- (bare literals like ('sales', …) coerce fine — only the CASE form breaks). This silently broke:
--   • COD collection on "Mark delivered" (fulfillment)
--   • the invoice "Record a payment" panel (advance / part-payment)
--   • Udhaar party receive on /admin/creditors (oldest-first allocation)
-- Fix: recreate both functions with an explicit ::public.ledger_kind cast. IDEMPOTENT.

-- 1) record_payment — single-bill receipt, clamped to the true GST-aware due (0045 logic kept).
create or replace function public.record_payment(p_order uuid, p_amount bigint, p_mode text default 'cash')
returns void language plpgsql as $$
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
        pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end
    where id = p_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
          p_order, v_amt, 'payment ' || coalesce(p_mode,'cash'));
end; $$;

-- 2) record_party_payment — lump receipt from a party, allocated oldest-first (0045 logic kept).
create or replace function public.record_party_payment(
  p_customer uuid, p_amount bigint, p_mode text default 'cash', p_note text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_left bigint := p_amount; v_applied bigint; v_allocs jsonb := '[]'::jsonb;
  v_name text; v_phone text; o record;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be positive'; end if;
  select name, phone into v_name, v_phone from public.customers where id = p_customer;
  if not found then raise exception 'Unknown customer %', p_customer; end if;

  for o in
    select id, invoice_no,
           greatest(0, public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
                       - coalesce(amount_paid,0)) as due,
           bill_type
    from public.orders
    where (customer_id = p_customer
           or (v_phone is not null and v_phone <> '' and customer_phone = v_phone))
      and status not in ('cancelled','void','refunded')
      and public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
          > coalesce(amount_paid,0)
    order by created_at asc
    for update
  loop
    exit when v_left <= 0;
    v_applied := least(v_left, o.due);
    update public.orders
      set amount_paid = coalesce(amount_paid,0) + v_applied,
          pay_cash = coalesce(pay_cash,0) + case when p_mode = 'cash' then v_applied else 0 end,
          pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_applied else 0 end
      where id = o.id;
    insert into public.ledger(kind, ref_id, credit, note)
      values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
              o.id, v_applied,
              'party payment ' || coalesce(p_mode,'cash') || coalesce(' · ' || o.invoice_no, ''));
    v_allocs := v_allocs || jsonb_build_object('order_id', o.id, 'invoice_no', o.invoice_no, 'applied', v_applied);
    v_left := v_left - v_applied;
  end loop;

  -- Surplus = advance we hold for the party → reduces what they owe (0045 sign).
  if v_left > 0 then
    update public.customers set credit_balance = coalesce(credit_balance,0) - v_left where id = p_customer;
  end if;

  insert into public.party_payments(customer_id, customer_name, customer_phone, amount, mode, allocations, unallocated, note)
  values (p_customer, v_name, v_phone, p_amount, coalesce(p_mode,'cash'), v_allocs, v_left, p_note);

  insert into public.audit_log(actor, action, ref, detail)
  values ('staff', 'party_payment', p_customer::text,
          'Received ' || p_amount || 'p (' || coalesce(p_mode,'cash') || ') across ' || jsonb_array_length(v_allocs) || ' bill(s)');

  return jsonb_build_object('allocated', p_amount - v_left, 'unallocated', v_left,
                            'bills', jsonb_array_length(v_allocs), 'allocations', v_allocs);
end; $$;
