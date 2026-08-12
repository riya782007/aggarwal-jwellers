-- 0072 — Box / group QR over individually-tracked units.
-- A "box" is a convenience aggregation: ONE scannable QR that resolves to a piece SKU + a pack count,
-- so scanning it at the POS adds N individual units to the bill. Stock still lives on the piece SKU
-- (product/variant qty) — the box holds NO stock of its own; its availability is derived from the
-- piece's live stock. Homogeneous boxes only (N of the same design), per the owner's spec.
create table if not exists public.inventory_groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- QR payload key: sticker encodes <site>/g/<code>
  label       text,                                 -- human name, e.g. "Kundan bangle box · 6"
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.variants(id) on delete cascade,  -- null = simple product
  pack_qty    int  not null default 1 check (pack_qty >= 1),
  status      text not null default 'active',        -- active | archived
  created_at  timestamptz not null default now()
);
create index if not exists inventory_groups_product_idx on public.inventory_groups(product_id);
create index if not exists inventory_groups_variant_idx on public.inventory_groups(variant_id);
-- Admin-only, like the rest of the console: RLS on, no anon policy (service-role reads bypass it).
alter table public.inventory_groups enable row level security;
