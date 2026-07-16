-- Aggarwal Jewellers — 0050: Units of measure + own item codes (client questionnaire Q21–22).
-- ADDITIVE + IDEMPOTENT.
--   • products.unit — how the item is counted/sold: pc (default) | pair | set | dozen.
--     Bangles sell in sets/pairs and a few items by the dozen; the unit shows on bills,
--     estimates, the catalogue and the storefront so "qty 2" reads as "2 set".
--   • Item codes: the owner keeps THEIR OWN codes (Quick-add now asks); auto-generated
--     fallback codes switch from the legacy BD#### to AJ#### (existing SKUs are untouched —
--     printed labels keep scanning).

alter table public.products add column if not exists unit text not null default 'pc';
do $$ begin
  alter table public.products add constraint products_unit_chk check (unit in ('pc','pair','set','dozen'));
exception when duplicate_object then null; end $$;
