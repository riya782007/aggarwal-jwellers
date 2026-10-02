-- 0079 — SKU aliases: printed stickers survive a SKU rename (safe to re-run).
-- A QR sticker encodes the SKU as it was on the day it was printed. Renaming a product (and the
-- cascade that renames its colour/size variants) used to make every one of those stickers fail at
-- the counter with "No product …". The app now records the OLD sku here on every rename, and the
-- POS / Estimates scanner resolves an old sticker to the item it was printed for.
-- Expected result: Success. No rows returned.

create table if not exists public.sku_aliases (
  alias       text primary key,                                            -- old SKU, stored UPPER-case
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.variants(id) on delete cascade,       -- null = the product itself
  created_at  timestamptz not null default now()
);
create index if not exists sku_aliases_product_idx on public.sku_aliases(product_id);
create index if not exists sku_aliases_variant_idx on public.sku_aliases(variant_id);
-- Admin-only, like the rest of the console: RLS on, no anon policy (service-role reads bypass it).
alter table public.sku_aliases enable row level security;
