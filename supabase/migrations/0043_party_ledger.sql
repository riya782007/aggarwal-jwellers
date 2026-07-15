-- Aggarwal Jewellers — 0043: Party ledger (udhaar) — receive payment at the PARTY level.
--
-- ADDITIVE + IDEMPOTENT. Builds on 0040 (customers, orders.amount_paid) and 0041
-- (record_payment). Adds:
--   1) party_payments        — audit trail of every payment received from a party
--   2) v_party_outstanding   — one row per party with live outstanding (mirrors app logic)
--   3) record_party_payment  — "Sharma ne 5000 diye": allocates a lump payment across the
--                              party's open bills OLDEST-FIRST; any surplus is kept as an
--                              advance on customers.credit_balance (the manual-adjustment
--                              field per lib/supabase/queries.ts Pillar 8).

-- 1) party_payments ------------------------------------------------------------------------
create table if not exists public.party_payments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  amount bigint not null check (amount > 0),        -- paise
  mode text not null default 'cash',                -- cash | upi | bank
  allocations jsonb not null default '[]'::jsonb,   -- [{order_id, invoice_no, applied}]
  unallocated bigint not null default 0,            -- surplus kept as advance (paise)
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_party_payments_customer on public.party_payments(customer_id, created_at);
alter table public.party_payments enable row level security;

-- 2) v_party_outstanding -------------------------------------------------------------------
-- Groups the same way the app's getCreditors() does: by customer_id when present, else by
-- phone, else by name — so walk-in bills without a customer record still show up.
create or replace view public.v_party_outstanding as
select
  max(o.customer_id::text)::uuid                                   as customer_id,
  coalesce(max(c.name), max(o.customer_name), 'Walk-in')           as name,
  coalesce(max(c.phone), max(o.customer_phone), '')                as phone,
  sum(greatest(0, coalesce(o.total,0) - coalesce(o.amount_paid,0))) as outstanding,  -- paise
  count(*) filter (where coalesce(o.total,0) > coalesce(o.amount_paid,0)) as open_bills,
  min(o.created_at) filter (where coalesce(o.total,0) > coalesce(o.amount_paid,0)) as oldest_due
from public.orders o
left join public.customers c on c.id = o.customer_id
where o.status not in ('cancelled','void')
group by coalesce(o.customer_id::text, nullif(o.customer_phone,''), coalesce(o.customer_name,'walkin'))
having sum(greatest(0, coalesce(o.total,0) - coalesce(o.amount_paid,0))) > 0;

-- 3) record_party_payment ------------------------------------------------------------------
create or replace function public.record_party_payment(
  p_customer uuid,
  p_amount   bigint,
  p_mode     text default 'cash',
  p_note     text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_left    bigint := p_amount;
  v_applied bigint;
  v_allocs  jsonb  := '[]'::jsonb;
  v_name    text;
  v_phone   text;
  o         record;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be positive'; end if;
  select name, phone into v_name, v_phone from public.customers where id = p_customer;
  if not found then raise exception 'Unknown customer %', p_customer; end if;

  -- Allocate oldest-bill-first across this party's open bills (matched by customer_id
  -- OR their phone, same as the customer-ledger view in the app).
  for o in
    select id, invoice_no, coalesce(total,0) - coalesce(amount_paid,0) as due
    from public.orders
    where (customer_id = p_customer
           or (v_phone is not null and v_phone <> '' and customer_phone = v_phone))
      and status not in ('cancelled','void')
      and coalesce(total,0) > coalesce(amount_paid,0)
    order by created_at asc
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

  -- Surplus stays on account as an advance (manual-adjustment field, shown on the
  -- customer page as "manual adj.").
  if v_left > 0 then
    update public.customers set credit_balance = coalesce(credit_balance,0) + v_left where id = p_customer;
  end if;

  insert into public.party_payments(customer_id, customer_name, customer_phone, amount, mode, allocations, unallocated, note)
  values (p_customer, v_name, v_phone, p_amount, coalesce(p_mode,'cash'), v_allocs, v_left, p_note);

  insert into public.audit_log(actor, action, ref, detail)
  values ('staff', 'party_payment', p_customer::text,
          'Received ' || p_amount || 'p (' || coalesce(p_mode,'cash') || ') across ' || jsonb_array_length(v_allocs) || ' bill(s)');

  return jsonb_build_object(
    'allocated',   p_amount - v_left,
    'unallocated', v_left,
    'bills',       jsonb_array_length(v_allocs),
    'allocations', v_allocs
  );
end; $$;
