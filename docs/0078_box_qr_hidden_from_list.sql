-- 0078 — Box QR list-hide column (safe to re-run).
-- After a box sticker is printed, the row is hidden from /admin/barcodes but MUST stay
-- status=active so the sticker still scans at POS. Without this column, hide is a no-op
-- and archived stickers from the old print flow fail at the counter.
-- Expected result: Success. No rows returned.

alter table public.inventory_groups
  add column if not exists hidden_from_list boolean not null default false;

update public.inventory_groups
   set status = 'active', hidden_from_list = true
 where status = 'archived';
