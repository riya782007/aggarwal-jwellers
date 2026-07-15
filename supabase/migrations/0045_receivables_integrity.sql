-- Aggarwal Jewellers — 0045: Receivables & payments integrity (business-workflow audit fixes).
-- ADDITIVE + IDEMPOTENT. Root problem class: the invoice's authoritative "Balance due" is the
-- GST-INCLUSIVE grand total minus paid, but aggregated receivables (Udhaar, party allocation,
-- health view) used the PRE-TAX `orders.total` — the classic "ledger got ₹1000 instead of ₹1180"
-- bug. This migration creates ONE SQL source of truth (order_grand_paise, mirrored in TS by
-- lib/business.ts orderGrandPaise) and rebuilds every dependent function/view on it. It also:
--   • makes sales returns reduce the bill's receivable (orders.return_amount, backfilled),
--   • clamps payments to what is actually due (over-tender no longer inflates cash-in-hand),
--   • fixes the advance sign in record_party_payment (surplus REDUCES what the party owes),
--   • locks order rows during allocation (no double-allocation on concurrent payments),
--   • repoints v_overpaid_orders at the grand total so it lists genuine refund-due bills.

-- 1) Returned-goods value against a bill (pre-tax paise) ---------------------------------------
alter table public.orders add column if not exists return_amount bigint not null default 0;

-- Backfill from historical sales returns (each return wrote a ledger debit ref'ing the return id).
update public.orders o
set return_amount = sub.amt
from (
  select r.ref_order_id, sum(l.debit) as amt
  from public.returns r
  join public.ledger l on l.ref_id = r.id and l.kind = 'sales' and coalesce(l.debit, 0) > 0
  where r.kind = 'sales' and r.ref_order_id is not null
  group by r.ref_order_id
) sub
where o.id = sub.ref_order_id and coalesce(o.return_amount, 0) = 0;

-- 2) THE source of truth: what the customer actually pays for a bill --------------------------
--    cash memo → total · GST inclusive → total · GST exclusive/auto → total + 3%,
--    net of returns, rounded to the nearest ₹1 (matches the printed Grand Total and the
--    cap trigger from 0034). Keep in sync with lib/business.ts orderGrandPaise().
create or replace function public.order_grand_paise(
  p_total bigint, p_bill_type text, p_gst_mode text, p_return_amount bigint default 0
) returns bigint language sql immutable as $$
  select (round((
    case when coalesce(p_bill_type, 'cash') = 'gst' and coalesce(p_gst_mode, 'exclusive') <> 'inclusive'
      then greatest(0, coalesce(p_total,0) - coalesce(p_return_amount,0))
           + round(greatest(0, coalesce(p_total,0) - coalesce(p_return_amount,0)) * 0.03)
      else greatest(0, coalesce(p_total,0) - coalesce(p_return_amount,0))
    end) / 100.0) * 100)::bigint;
$$;

-- 3) record_payment — clamp to the true due; over-tender no longer inflates pay_cash/pay_bank --
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
  values (case when p_mode = 'cash' then 'cash' else 'bank' end, p_order, v_amt, 'payment ' || coalesce(p_mode,'cash'));
end; $$;

-- 4) record_party_payment — GST-aware allocation, row locks, correct advance sign --------------
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
      values (case when p_mode = 'cash' then 'cash' else 'bank' end, o.id, v_applied,
              'party payment ' || coalesce(p_mode,'cash') || coalesce(' · ' || o.invoice_no, ''));
    v_allocs := v_allocs || jsonb_build_object('order_id', o.id, 'invoice_no', o.invoice_no, 'applied', v_applied);
    v_left := v_left - v_applied;
  end loop;

  -- Surplus = ADVANCE we hold for the party → REDUCES what they owe. (0043 had the sign
  -- inverted: it ADDED the surplus to credit_balance, whose positive direction means
  -- "customer owes us" per the Customers page. Corrected here.)
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

-- One-time correction of advances mis-signed by 0043 (recorded in party_payments.unallocated).
-- Guarded by an audit-log marker so re-running this file never double-applies the fix.
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'fix_0045_advance_sign') then
    update public.customers c
    set credit_balance = coalesce(c.credit_balance,0) - 2 * sub.adv
    from (
      select customer_id, sum(unallocated) as adv
      from public.party_payments
      where coalesce(unallocated,0) > 0 and customer_id is not null
      group by customer_id
    ) sub
    where c.id = sub.customer_id;
    insert into public.audit_log(actor, action, ref, detail)
    values ('system', 'fix_0045_advance_sign', 'migration', 'Re-signed advances recorded under 0043 (credit_balance -= 2×unallocated).');
  end if;
end $$;

-- 5) v_party_outstanding — GST-aware, net of returns, dead statuses excluded -------------------
create or replace view public.v_party_outstanding as
select
  max(o.customer_id::text)::uuid                                   as customer_id,
  coalesce(max(c.name), max(o.customer_name), 'Walk-in')           as name,
  coalesce(max(c.phone), max(o.customer_phone), '')                as phone,
  sum(greatest(0, public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0))
                  - coalesce(o.amount_paid,0)))                    as outstanding,
  count(*) filter (where public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0))
                         > coalesce(o.amount_paid,0))              as open_bills,
  min(o.created_at) filter (where public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0))
                                  > coalesce(o.amount_paid,0))     as oldest_due
from public.orders o
left join public.customers c on c.id = o.customer_id
where o.status not in ('cancelled','void','refunded')
group by coalesce(o.customer_id::text, nullif(o.customer_phone,''), coalesce(o.customer_name,'walkin'))
having sum(greatest(0, public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0))
                       - coalesce(o.amount_paid,0))) > 0;

-- 6) v_accounting_health — receivable now GST-aware & net of returns ---------------------------
create or replace view public.v_accounting_health as
select
  (select count(*) from v_inventory_reconciliation) as inventory_drift_products,
  (select count(*) from v_overpaid_orders) as overpaid_orders,
  (select count(*) from products where coalesce(qty,0) < 0) as negative_stock,
  (select count(*) from stock_adjustments where ref_id is null and kind in ('sale','purchase','return','estimate')) as movements_without_source,
  (select coalesce(sum(greatest(0, public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
                                   - coalesce(amount_paid,0))),0)
     from orders where status not in ('cancelled','void','refunded')) as receivable_paise,
  (select coalesce(sum(p.total),0) - coalesce((select sum(amount) from supplier_payments),0) from purchases p) as payable_paise;

-- 7) v_overpaid_orders — compare against the GRAND total: a "refund due" list ------------------
create or replace view public.v_overpaid_orders as
select id, invoice_no, customer_name, total, amount_paid,
       amount_paid - public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0)) as overpaid
from public.orders
where coalesce(amount_paid,0) > public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
  and status not in ('cancelled','void','refunded');

-- 8) record_sales_return — returns now PROPAGATE to receivables (orders.return_amount) ---------
--    Same body as 0034 plus the one new update; stock movement + ledger + audit unchanged.
create or replace function public.record_sales_return(p_order_id uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer as $function$
declare v_id uuid := uuid_generate_v4(); it jsonb; v_qty int:=0; v_amt int:=0; v_bal int;
        v_prod uuid; v_variant uuid; v_unit int; v_sku text; v_iqty int;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := (it->>'product_id')::uuid;
    v_variant := nullif(it->>'variant_id','')::uuid;
    v_iqty := (it->>'qty')::int;
    if v_iqty is null or v_iqty <= 0 then continue; end if;
    select unit_price into v_unit from order_items where order_id=p_order_id and product_id=v_prod limit 1;
    if v_variant is not null then
      update variants set qty = qty + v_iqty where id = v_variant;
      update products set qty = (select coalesce(sum(qty),0) from variants where product_id = v_prod), last_movement_at=now() where id=v_prod;
      select upper(sku) into v_sku from variants where id = v_variant;
    else
      update products set qty = qty + v_iqty, last_movement_at=now() where id=v_prod;
      select upper(sku) into v_sku from products where id = v_prod;
    end if;
    v_qty := v_qty + v_iqty;
    v_amt := v_amt + coalesce(v_unit,0)*v_iqty;
    insert into stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id, created_at)
      values (v_prod, v_variant, v_sku, v_iqty, 'return', 'Sales return', coalesce(nullif(p_reason,''),'Returned'), p_order_id, now());
  end loop;
  insert into returns(id, kind, ref_order_id, reason, qty, created_at) values (v_id, 'sales', p_order_id, p_reason, v_qty, now());
  select coalesce(max(balance),0) into v_bal from ledger;
  insert into ledger(kind, ref_id, debit, credit, balance, note, created_at) values('sales', v_id, v_amt, 0, v_bal - v_amt, concat('Sales return: ', p_reason), now());
  -- NEW (0045): the returned value reduces this bill's receivable everywhere (Udhaar, customer
  -- ledger, allocation, health view) via order_grand_paise(total, …, return_amount).
  update orders set return_amount = coalesce(return_amount,0) + v_amt where id = p_order_id;
  insert into audit_log(actor, action, ref, detail) values('staff','sales_return', v_id::text, p_reason);
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $function$;
