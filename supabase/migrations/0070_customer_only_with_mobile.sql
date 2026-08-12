-- CHANGE (owner request): a customer is added to the directory ONLY when a real mobile is entered.
-- Walk-in cash bills (Cash (R) / Cash (W), no phone) previously created a new customer row on every
-- bill (posSaleAction matched only by phone, so a name-only walk-in never matched and re-inserted).
-- Now: no mobile ⇒ no customer row (the order keeps its "Cash (R)/(W)" label); with a mobile the
-- customer is matched/created by phone (no duplicates). posSaleAction is fixed in app code to match,
-- and this RPC (used by place_order) is the server-side backstop.
CREATE OR REPLACE FUNCTION public.aj_upsert_customer(p_customer jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare v_id uuid; v_name text; v_phone text;
begin
  v_name  := nullif(trim(coalesce(p_customer->>'name','')), '');
  v_phone := nullif(trim(coalesce(p_customer->>'phone','')), '');
  if v_phone is null then return null; end if;   -- anonymous walk-in: do not create a customer
  select id into v_id from public.customers where phone = v_phone limit 1;
  if v_id is null then
    insert into public.customers(name, phone) values (coalesce(v_name, v_phone), v_phone) returning id into v_id;
  end if;
  return v_id;
end; $function$;

-- One-time cleanup of the junk walk-in rows already created (orders keep their label via
-- orders.customer_name; only the directory rows are removed).
update public.orders set customer_id = null
 where customer_id in (
   select id from public.customers
   where (phone is null or phone = '')
     and (name ilike 'cash (%' or lower(coalesce(name,'')) in ('walk-in','walk in',''))
 );
delete from public.customers
 where (phone is null or phone = '')
   and (name ilike 'cash (%' or lower(coalesce(name,'')) in ('walk-in','walk in',''));
