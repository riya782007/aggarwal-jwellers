-- Aggarwal Jewellers — 0057: add the supplier columns the app writes but 0001 never created.
-- "Add supplier" silently failed: upsertSupplierAction inserts kind/state/phone/gstin/address/notes,
-- but the suppliers table (migration 0001) only had id/name/city/created_at. One unknown column
-- makes Supabase reject the whole insert, and the server action swallowed the error — so nothing
-- saved and no supplier could be created (which also blocks recording purchases + purchase returns).
-- Same class as the orders.buyer_* fix (0054). ADDITIVE + IDEMPOTENT.

alter table public.suppliers add column if not exists kind    text not null default 'supplier';
alter table public.suppliers add column if not exists state   text;
alter table public.suppliers add column if not exists phone   text;
alter table public.suppliers add column if not exists gstin   text;
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists notes   text;

do $$ begin
  alter table public.suppliers add constraint suppliers_kind_chk check (kind in ('supplier','vendor'));
exception when duplicate_object then null; end $$;
