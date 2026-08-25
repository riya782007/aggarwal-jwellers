-- Run once on the live Supabase project (SQL editor) if hidden_from_list is not yet present.
-- Safe to re-run.

alter table public.inventory_groups
  add column if not exists hidden_from_list boolean not null default false;

-- Stickers that were wrongly archived by the old print/delete flow: make POS work again,
-- and keep them off the barcodes list.
update public.inventory_groups
set status = 'active', hidden_from_list = true
where status = 'archived';
