-- BUG FIX (missing columns the app already writes/reads):
-- 1) estimate_items.variant_id — addEstimateItemAction inserts it (to record the exact colour on a
--    quote) and getEstimate embeds variant:variants(...) which needs this FK. Without the column,
--    adding an estimate line failed and the estimate detail page couldn't load its items.
alter table public.estimate_items
  add column if not exists variant_id uuid references public.variants(id) on delete set null;

-- 2) suppliers.opening_balance — setSupplierOpeningBalanceAction writes it (paise) and the supplier
--    page reads it. Without the column the write silently failed and the value always showed 0.
alter table public.suppliers
  add column if not exists opening_balance bigint not null default 0;
