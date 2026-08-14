-- ============================================================================
-- Aggarwal Jewellers — CONSOLIDATED DATABASE SCHEMA (squashed migrations).
-- One file replacing the old numbered migrations, kept in original apply order.
-- The live Supabase DB (project wttvfgppfaquslqxieba) is the source of truth;
-- this file reproduces it when replayed top-to-bottom on a fresh database.
-- ============================================================================

-- ------------------------------------------------------------ 0001_init.sql
-- Aggarwal Jewellers — initial schema (Part E.3)
-- Postgres + RLS. Money columns are integer paise.

create extension if not exists "uuid-ossp";
-- pgvector optional; embeddings nullable so demo runs without it.
-- create extension if not exists vector;

-- ---------- enums ----------
do $$ begin
  create type product_type as enum ('simple','configurable');
exception when duplicate_object then null; end $$;
do $$ begin
  create type product_status as enum ('draft','published','flagged');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_channel as enum ('retail','wholesale','pos');
exception when duplicate_object then null; end $$;
do $$ begin
  create type estimate_status as enum ('open','converted','expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type return_kind as enum ('sales','purchase');
exception when duplicate_object then null; end $$;
do $$ begin
  create type ledger_kind as enum ('sales','purchase','cash','bank');
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notify_channel as enum ('whatsapp','sms','email','in_app');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notify_status as enum ('sent','acked','escalated');
exception when duplicate_object then null; end $$;

-- ---------- catalogue ----------
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id),
  sku text not null unique,
  name text not null,
  type product_type not null default 'simple',
  base_wholesale integer not null,            -- paise
  qty integer not null default 0,
  status product_status not null default 'draft',
  generated_content jsonb,                    -- {title,description,specs,tags,seo}
  embedding jsonb,                            -- vector placeholder (jsonb until pgvector enabled)
  last_movement_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_status on products(status);

create table if not exists variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  color text,
  sku text not null unique,
  qty integer not null default 0,
  image_paths text[] default '{}'
);
create index if not exists idx_variants_product on variants(product_id);

create table if not exists product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  path text not null,
  kind text,                                  -- model|flatlay|closeup|angle
  sort int not null default 0
);
create index if not exists idx_images_product on product_images(product_id);

create table if not exists pricing_settings (
  id uuid primary key default uuid_generate_v4(),
  wholesale_markup_pct numeric not null default 10,
  retail_multiplier numeric not null default 2.2,
  mrp_multiplier numeric not null default 2.75,
  round_to integer not null default 100,      -- paise
  updated_at timestamptz not null default now()
);

-- ---------- commerce ----------
create table if not exists retailers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  channel order_channel not null,
  retailer_id uuid references retailers(id),
  status text not null default 'completed',
  total integer not null default 0,           -- paise
  payment_mode text,                          -- cod|online|cash|upi
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_created on orders(created_at);
create index if not exists idx_orders_channel on orders(channel);

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  variant_id uuid references variants(id),
  qty integer not null,
  unit_price integer not null,                -- paise
  line_total integer not null                 -- paise
);

create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid references suppliers(id),
  bill_no text,
  total integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  supplier_sku text,
  mapped_product_id uuid references products(id),
  qty integer not null,
  unit_cost integer not null
);

create table if not exists estimates (
  id uuid primary key default uuid_generate_v4(),
  customer_name text,
  total integer not null default 0,
  status estimate_status not null default 'open',
  created_at timestamptz not null default now()
);
create table if not exists estimate_items (
  id uuid primary key default uuid_generate_v4(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  product_id uuid references products(id),
  qty integer not null,
  unit_price integer not null,
  line_total integer not null
);

create table if not exists returns (
  id uuid primary key default uuid_generate_v4(),
  kind return_kind not null,
  ref_order_id uuid references orders(id),
  ref_purchase_id uuid references purchases(id),
  reason text,
  qty integer not null,
  created_at timestamptz not null default now()
);

create table if not exists ledger (
  id uuid primary key default uuid_generate_v4(),
  kind ledger_kind not null,
  ref_id uuid,
  debit integer not null default 0,
  credit integer not null default 0,
  balance integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_created on ledger(created_at);

-- ---------- RBAC + approvals ----------
create table if not exists roles (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  permissions text[] not null default '{}'
);
create table if not exists user_roles (
  user_id uuid not null,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);
create table if not exists approvals (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  payload jsonb,
  status approval_status not null default 'pending',
  otp_hash text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- human-in-the-loop + agents ----------
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  whatsapp text,
  phone text,
  email text,
  in_app_user_id uuid
);
create table if not exists assignments (
  id uuid primary key default uuid_generate_v4(),
  responsibility text not null,
  assigned_contact_id uuid references contacts(id),
  backup_contact_id uuid references contacts(id),
  channel notify_channel not null default 'in_app',
  sla_minutes integer not null default 30
);
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid references assignments(id),
  contact_id uuid references contacts(id),
  channel notify_channel,
  subject text,
  deep_link text,
  status notify_status not null default 'sent',
  sent_at timestamptz not null default now(),
  acked_at timestamptz,
  escalated_at timestamptz
);
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  at timestamptz not null default now(),
  actor text,
  action text,
  ref text,
  detail text
);
create table if not exists agent_runs (
  id uuid primary key default uuid_generate_v4(),
  agent text not null,
  trigger text,
  input jsonb,
  output jsonb,
  confidence numeric,
  needs_human boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists ai_calls (
  id uuid primary key default uuid_generate_v4(),
  feature text,
  provider text,
  latency_ms integer,
  tokens integer,
  cache_hit boolean default false,
  fallback_used boolean default false,
  created_at timestamptz not null default now()
);

-- ---------- marketing / analytics ----------
create table if not exists reels (
  id uuid primary key default uuid_generate_v4(),
  ig_id text,
  caption text,
  video_url text,
  posted_at timestamptz
);
create table if not exists reel_products (
  reel_id uuid references reels(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  primary key (reel_id, product_id)
);
create table if not exists ga_events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  params jsonb,
  sent_server_side boolean default false,
  created_at timestamptz not null default now()
);
create table if not exists gbp_state (
  id uuid primary key default uuid_generate_v4(),
  primary_category text,
  hours jsonb,
  last_synced_at timestamptz
);

-- ---------- RLS ----------
alter table products enable row level security;
alter table categories enable row level security;
alter table variants enable row level security;
alter table product_images enable row level security;

-- storefronts can read PUBLISHED products + their categories/variants/images.
do $$ begin
  create policy "public reads published products" on products
    for select using (status = 'published');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public reads categories" on categories for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public reads variants of published" on variants
    for select using (exists (select 1 from products p where p.id = variants.product_id and p.status = 'published'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public reads images of published" on product_images
    for select using (exists (select 1 from products p where p.id = product_images.product_id and p.status = 'published'));
exception when duplicate_object then null; end $$;
-- NOTE: all writes + admin reads go through the service role / authed staff checks
-- enforced in server actions (see lib/notify + RBAC). Tighten per-role in Phase 2.3.


-- ------------------------------------------------------------ 0002_subcategories.sql
-- Aggarwal Jewellers — 0002: Category hierarchy (subcategories) + product↔subcategory mapping.
--
-- ADDITIVE + IDEMPOTENT. Safe to run on the live DB after 0001. Adds:
--   • categories.parent_id      → self-referential hierarchy (future nesting)
--   • categories.sort           → manual ordering of parent categories
--   • subcategories             → named children of a parent category (the business
--                                 model: Necklaces → Oxidised, Kundan, Temple, …)
--   • products.subcategory_id   → a product's primary subcategory (fast filter)
--   • product_subcategory_map   → many-to-many so a product can sit in several
--                                 subcategories (the spec's "multiple subcategories")
--
-- Catalogue sharing then filters by category OR subcategory OR selected products,
-- e.g. share only "Oxidised Necklaces" without the rest of the necklace inventory.

-- 1) Extend categories with hierarchy + ordering ----------------------------------
alter table categories add column if not exists parent_id uuid references categories(id) on delete set null;
alter table categories add column if not exists sort integer not null default 0;
create index if not exists idx_categories_parent on categories(parent_id);

-- 2) Subcategories ----------------------------------------------------------------
create table if not exists subcategories (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
-- slug is unique within a parent category (two parents may each have "Long").
create unique index if not exists uq_subcategories_cat_slug on subcategories(category_id, slug);
create index if not exists idx_subcategories_category on subcategories(category_id);

-- 3) Product primary subcategory (nullable; null = "uncategorised within parent") --
alter table products add column if not exists subcategory_id uuid references subcategories(id) on delete set null;
create index if not exists idx_products_subcategory on products(subcategory_id);

-- 4) Many-to-many: a product can belong to multiple subcategories ------------------
create table if not exists product_subcategory_map (
  product_id uuid not null references products(id) on delete cascade,
  subcategory_id uuid not null references subcategories(id) on delete cascade,
  primary key (product_id, subcategory_id)
);
create index if not exists idx_psm_subcategory on product_subcategory_map(subcategory_id);

-- 5) RLS — storefront may read subcategories + the map of published products -------
alter table subcategories enable row level security;
alter table product_subcategory_map enable row level security;
do $$ begin
  create policy "public reads subcategories" on subcategories for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public reads psm of published" on product_subcategory_map
    for select using (exists (select 1 from products p where p.id = product_subcategory_map.product_id and p.status = 'published'));
exception when duplicate_object then null; end $$;

-- 6) Convenience: keep the primary subcategory in the M2M map automatically --------
create or replace function sync_primary_subcategory() returns trigger as $$
begin
  if new.subcategory_id is not null then
    insert into product_subcategory_map(product_id, subcategory_id)
    values (new.id, new.subcategory_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger trg_sync_primary_subcategory
    after insert or update of subcategory_id on products
    for each row execute function sync_primary_subcategory();
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 0003_pricing_overrides.sql
-- Aggarwal Jewellers — 0003: Explicit per-product & per-variant price overrides (Phase 4).
--
-- ADDITIVE + IDEMPOTENT. Safe to run after 0001/0002.
--
-- The formula (pricing_settings) stays the DEFAULT for every product. These nullable
-- columns let the owner pin an exact MRP / Retail / Wholesale price when they don't
-- want the formula's number. All values are integer PAISE. NULL = "inherit".
--
-- Resolution order at read time (see lib/pricing.ts resolvePrices):
--     variant override  →  product override  →  formula default
--
-- So a product can have a fixed retail price while a specific colour variant has its
-- own MRP, and everything else still flows from the single formula.

alter table products add column if not exists wholesale_override integer;  -- paise, null = formula
alter table products add column if not exists retail_override    integer;  -- paise, null = formula
alter table products add column if not exists mrp_override        integer;  -- paise, null = formula

alter table variants add column if not exists wholesale_override integer;   -- paise, null = inherit product/formula
alter table variants add column if not exists retail_override    integer;
alter table variants add column if not exists mrp_override        integer;

-- Guard against nonsensical negative overrides (NULL still allowed = inherit).
do $$ begin
  alter table products add constraint products_overrides_nonneg
    check (
      (wholesale_override is null or wholesale_override >= 0) and
      (retail_override    is null or retail_override    >= 0) and
      (mrp_override        is null or mrp_override        >= 0)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table variants add constraint variants_overrides_nonneg
    check (
      (wholesale_override is null or wholesale_override >= 0) and
      (retail_override    is null or retail_override    >= 0) and
      (mrp_override        is null or mrp_override        >= 0)
    );
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 0004_inventory.sql
-- Aggarwal Jewellers — 0004: Inventory upgrades (Phase 6).
--
-- ADDITIVE + IDEMPOTENT. Safe to run after 0001–0003.
--
-- Adds variant-level + typed stock movements to the audit ledger:
--   • stock_adjustments.variant_id  → adjust a specific colour/size variant
--   • stock_adjustments.kind        → typed movement: purchase | sale | return |
--                                      damage | recount | correction | manual
--
-- (The table is created here defensively in case it was only made ad-hoc earlier.)

create table if not exists stock_adjustments (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  sku text,
  delta integer not null,
  source text,
  reason text,
  created_at timestamptz not null default now()
);

alter table stock_adjustments add column if not exists variant_id uuid references variants(id) on delete set null;
alter table stock_adjustments add column if not exists kind text;

create index if not exists idx_stock_adj_product on stock_adjustments(product_id, created_at desc);
create index if not exists idx_stock_adj_variant on stock_adjustments(variant_id);
create index if not exists idx_stock_adj_kind on stock_adjustments(kind);


-- ------------------------------------------------------------ 0005_rls_lockdown.sql
-- Aggarwal Jewellers — 0005: RLS lockdown of sensitive tables (Phase 8, defense-in-depth).
--
-- ADDITIVE + IDEMPOTENT + SAFE.
--
-- Security model: the app reaches Supabase ONLY through the server using the
-- SERVICE-ROLE key (lib/supabase/server.ts), which BYPASSES Row Level Security.
-- The browser client (lib/supabase/browser.ts) is not imported anywhere. So no
-- legitimate request reads these tables with the anon/authenticated key.
--
-- Enabling RLS with NO policy therefore changes nothing for the app, but slams the
-- door on direct anon-key access to financial records, customer PII, role passcodes,
-- and the audit trail — closing the exact hole Supabase warned about for
-- stock_adjustments. RBAC itself is enforced in the server actions (requirePerm).
--
-- Storefront-public tables (products, categories, variants, product_images) keep
-- their existing public-read policies from 0001 and are intentionally NOT touched.

do $$
declare t text;
begin
  foreach t in array array[
    'orders','order_items','customers','retailers',
    'estimates','estimate_items','purchases','purchase_items','returns',
    'ledger','suppliers','approvals','audit_log','agent_runs','ai_calls',
    'roles','user_roles','contacts','assignments','notifications',
    'reviews','reels','reel_products','ga_events','gbp_state','stock_adjustments'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------ 0006_overselling_guard.sql
-- Phase 2 (#2/#29): block billing more than is in stock, across every channel.
-- A new p_allow_oversell flag (default false) lets the owner deliberately backorder.
-- Applied to: place_order, place_wholesale_order, convert_estimate_v2.
-- (Full function bodies applied via Supabase migration 0006_overselling_guard.)

-- place_order: guards each line; raises a human-readable error naming the SKU,
--   available qty and billed qty when stock is insufficient and backorder is off.
-- place_wholesale_order: same guard for the wholesale portal.
-- convert_estimate_v2: pre-validates every estimate line before billing (atomic).
--
-- See git history / Supabase migration list for the authoritative bodies.
-- Re-running the CREATE OR REPLACE statements is safe (idempotent).


-- ------------------------------------------------------------ 0006_visibility_labels_variants.sql
-- Aggarwal Jewellers — 0006: wholesale-only visibility, SKU labels, variant size/polish.
--
-- ADDITIVE + IDEMPOTENT. Safe to run after 0001–0005.
--
-- Req 1: some products are wholesale-only and must NOT show to retail/public shoppers.
-- Req 9: free-form labels/tags on a SKU (e.g. "Bridal", "Bestseller", "New").
-- Req 7: variants are configured by colour AND size AND polish (not colour alone).

alter table products add column if not exists visibility text not null default 'all';  -- 'all' | 'wholesale'
alter table products add column if not exists labels text[] not null default '{}';
do $$ begin
  alter table products add constraint products_visibility_chk check (visibility in ('all','wholesale'));
exception when duplicate_object then null; end $$;
create index if not exists idx_products_visibility on products(visibility);

alter table variants add column if not exists size text;
alter table variants add column if not exists polish text;


-- ------------------------------------------------------------ 0007_variant_attributes.sql
-- Phase 3 (#7/#33/#28): variants gain explicit size & polish; a self-growing master
-- list of colour/size/polish values powers datalist suggestions in the admin.
alter table public.variants add column if not exists size text;
alter table public.variants add column if not exists polish text;

create table if not exists public.variant_options (
  id uuid primary key default extensions.uuid_generate_v4(),
  kind text not null check (kind in ('color','size','polish')),
  value text not null,
  sort int not null default 0,
  created_at timestamptz default now(),
  unique (kind, value)
);
alter table public.variant_options enable row level security;
drop policy if exists variant_options_read on public.variant_options;
create policy variant_options_read on public.variant_options for select using (true);

insert into public.variant_options(kind,value,sort) values
 ('color','Gold',1),('color','Silver',2),('color','Rose Gold',3),('color','Oxidised',4),
 ('color','Green',5),('color','Red',6),('color','Blue',7),('color','Pink',8),
 ('color','White',9),('color','Black',10),('color','Maroon',11),('color','Multicolour',12),
 ('size','Small',1),('size','Medium',2),('size','Large',3),('size','Free Size',4),
 ('size','2.4',5),('size','2.6',6),('size','2.8',7),('size','2.10',8),
 ('polish','Gold',1),('polish','Silver',2),('polish','Rose Gold',3),('polish','Oxidised',4),
 ('polish','Antique',5),('polish','Matte',6),('polish','High Polish',7),('polish','Dual Tone',8)
on conflict (kind,value) do nothing;


-- ------------------------------------------------------------ 0008_purchase_per_variant.sql
-- Phase 3c (#8/#32): purchases can target a specific variant.
-- Adds purchase_items.variant_id and makes record_purchase increment the chosen
-- variant's stock, rolling the product total up from the sum of its variants.
alter table public.purchase_items add column if not exists variant_id uuid references public.variants(id);

-- record_purchase body re-applied with variant handling (see Supabase migration 0008
-- for the authoritative function definition). Re-running CREATE OR REPLACE is idempotent.


-- ------------------------------------------------------------ 0009_billing_override_and_tier.sql
-- Phase 4 (#16 + pricing correctness): billing RPCs now honour per-product price
-- overrides, and place_order accepts a p_tier ('retail'|'wholesale') so the counter
-- can bill approved retailers at wholesale rates. Retail storefront (default tier)
-- gets override-aware retail automatically, fixing the display-vs-billed mismatch.
--
-- Functions re-applied (authoritative bodies in Supabase migration 0009):
--   place_order(p_items, p_customer, p_channel, p_payment, p_allow_oversell, p_tier)
--   place_wholesale_order(...)  -- coalesce(wholesale_override, formula)
--   create_estimate(...)        -- coalesce(retail_override, formula)
-- Re-running the CREATE OR REPLACE statements is idempotent.


-- ------------------------------------------------------------ 0010_wholesale_only_and_min.sql
-- Phase 4b:
--  #1  products.wholesale_only — hidden from the D2C storefront/catalog, shown to retailers.
--  #27 place_wholesale_order enforces a ₹3,000 minimum (raises if the order is below it).
alter table public.products add column if not exists wholesale_only boolean not null default false;

-- place_wholesale_order re-applied with the ₹3,000 minimum check (authoritative body in
-- Supabase migration 0010). Re-running CREATE OR REPLACE is idempotent.


-- ------------------------------------------------------------ 0011_order_admin_note.sql
-- Phase 5a (#5/#34): internal note on an order/invoice — admin reference only,
-- never printed on the customer's copy.
alter table public.orders add column if not exists admin_note text;


-- ------------------------------------------------------------ 0012_split_payment.sql
-- Phase 5c (#14/#37): split tender per bill — cash vs bank (UPI/card) — so cash-in-hand
-- and bank receipts are accountable. Dashboard sums these into a collections split.
alter table public.orders add column if not exists pay_cash integer not null default 0;
alter table public.orders add column if not exists pay_bank integer not null default 0;


-- ------------------------------------------------------------ 0013_labels.sql
-- Phase 7a (#9/#31): owner-defined labels attachable to any product/SKU.
create table if not exists public.labels (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null unique,
  color text not null default 'emerald',
  sort int not null default 0,
  created_at timestamptz default now()
);
create table if not exists public.product_labels (
  product_id uuid not null references public.products(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (product_id, label_id)
);
alter table public.labels enable row level security;
alter table public.product_labels enable row level security;
drop policy if exists labels_read on public.labels;
create policy labels_read on public.labels for select using (true);
drop policy if exists product_labels_read on public.product_labels;
create policy product_labels_read on public.product_labels for select using (true);


-- ------------------------------------------------------------ 0014_feedback.sql
-- Phase 9 (#39): customer feedback captured from a public form, also sharable to WhatsApp.
create table if not exists public.feedback (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text,
  phone text,
  rating int check (rating between 1 and 5),
  message text,
  order_ref text,
  created_at timestamptz default now(),
  seen boolean not null default false
);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check (true);


-- ------------------------------------------------------------ 0015_qty_non_negative.sql
-- Pillar 2 — defence-in-depth for "no negative inventory".
--
-- The app already clamps qty at 0 (lib `Math.max(0, …)` in `app/actions/stock.ts` and
-- `app/actions/diva.ts`), and the sales path funnels through `place_order` /
-- `place_wholesale_order` / `convert_estimate_v2` RPCs which honour `p_allow_oversell`.
-- But a direct UPDATE (e.g. a manual hot-fix in the Supabase SQL editor, a future code
-- path that forgets the clamp, or a third-party tool) could still push qty below zero.
--
-- These CHECK constraints make the database itself refuse to store a negative count.
-- IF EXISTS / DROP-then-ADD pattern keeps the migration idempotent.

-- Floor product stock at zero.
alter table public.products drop constraint if exists products_qty_non_negative;
alter table public.products add  constraint products_qty_non_negative check (qty >= 0);

-- Floor variant stock at zero.
alter table public.variants drop constraint if exists variants_qty_non_negative;
alter table public.variants add  constraint variants_qty_non_negative check (qty >= 0);

-- Belt-and-braces: also guarantee the stock_adjustments ledger never gets a "phantom" zero
-- row. The app already short-circuits on zero deltas, but a hand-crafted UPDATE could
-- leave a row that contributes nothing to inventory and just clutters the History tab.
alter table public.stock_adjustments drop constraint if exists stock_adjustments_delta_nonzero;
alter table public.stock_adjustments add  constraint stock_adjustments_delta_nonzero check (delta <> 0);


-- ------------------------------------------------------------ 0016_color_barcode_codes.sql
-- Pillar 7 / Pillar 11 — Canonical colour catalog with scanner-friendly barcode codes.
--
-- Adds `barcode_code` to variant_options so every standardised colour has a short suffix
-- (RED, MULTI1, SBLUE, RGOLD…) that prints on the barcode label and forms the variant
-- SKU. Full printed barcode for a variant becomes `{productSku}-{barcode_code}` —
-- e.g. AJ2024-RED for a red variant of product AJ2024.
--
-- The seed below is the 75-colour master Aggarwal runs the storefront on. Re-running is
-- safe — the `on conflict (kind, value)` clause refreshes `barcode_code` and `sort` only,
-- so any custom hex swatch the owner has set on a row is preserved.
--
-- Variants created BEFORE this migration keep their existing SKUs; the cascade is on
-- new auto-generated variant SKUs only (see app/actions/variants.ts addVariantAction).

alter table public.variant_options add column if not exists barcode_code text;

-- Faster lookups when the app resolves "what code does Red have?" during variant creation.
create index if not exists idx_variant_options_color_code on public.variant_options(kind, barcode_code) where kind = 'color';

-- Seed (or refresh) the 75-colour master.
insert into public.variant_options (kind, value, barcode_code, sort) values
  ('color', 'Red',             'RED',     1),
  ('color', 'Green',           'GREEN',   2),
  ('color', 'Yellow',          'YELLOW',  3),
  ('color', 'Black',           'BLACK',   4),
  ('color', 'White',           'WHITE',   5),
  ('color', 'Wine',            'WINE',    6),
  ('color', 'Purple',          'PURPLE',  7),
  ('color', 'Mint',            'MINT',    8),
  ('color', 'Peach',           'PEACH',   9),
  ('color', 'Multicolor 1',    'MULTI1', 10),
  ('color', 'Multicolor 2',    'MULTI2', 11),
  ('color', 'Sky Blue',        'SBLUE',  12),
  ('color', 'Royal Blue',      'RBLUE',  13),
  ('color', 'Navy Blue',       'NBLUE',  14),
  ('color', 'Maroon',          'MAROON', 15),
  ('color', 'Peacock Green',   'PGREEN', 16),
  ('color', 'Silver',          'SILVER', 17),
  ('color', 'Golden',          'GOLD',   18),
  ('color', 'Lavender',        'LAV',    19),
  ('color', 'Blush Pink',      'PINK',   20),
  ('color', 'Magenta',         'RANI',   21),
  ('color', 'Orange',          'ORANGE', 22),
  ('color', 'Ruby',            'RUBY',   23),
  ('color', 'Mehndi',          'MEH',    24),
  ('color', 'Pink Mint',       'PMINT',  25),
  ('color', 'Grey',            'GREY',   26),
  ('color', 'Gajri',           'GAJRI',  27),
  ('color', 'Peacock Blue',    'PBLUE',  28),
  ('color', 'Baby Pink',       'BPINK',  29),  -- distinct from Blush Pink (was duplicated as PINK in the source list)
  ('color', 'Maroon Green',    'MGREEN', 30),
  ('color', 'White Maroon',    'WMAROON',31),
  ('color', 'White Green',     'WGREEN', 32),
  ('color', 'White Magenta',   'WRANI',  33),
  ('color', 'White Red',       'WRED',   34),
  ('color', 'White Pink Mint', 'WPMINT', 35),
  ('color', 'White Multi',     'WMULTI', 36),
  ('color', 'Rose Gold',       'RGOLD',  37),
  ('color', 'Teal Green',      'TGREEN', 38),
  ('color', 'Green Red',       'GRED',   39),
  ('color', 'Ruby Green',      'RGREEN', 40),
  ('color', 'Brown',           'BROWN',  41),
  ('color', 'All',             'ALL',    42),
  ('color', 'Lemon',           'LEMON',  43),
  ('color', 'Mustard',         'MUSTARD',44),
  ('color', 'Off White',       'OWHITE', 45),
  ('color', 'Matte Gold',      'MGOLD',  46),
  ('color', 'Rainbow',         'RAIN',   47),
  ('color', 'Pearl',           'PEARL',  48),
  ('color', 'Matte Silver',    'MSLVER', 49),
  ('color', 'Multicolor 3',    'MULTI3', 50),
  ('color', 'Multicolor 4',    'MULTI4', 51),
  ('color', 'Multicolor 5',    'MULTI5', 52),
  ('color', 'Golden 2',        'GOLD2',  53),
  ('color', 'Silver 2',        'SILVER2',54),
  ('color', 'Ocean Blue',      'OBLUE',  55),
  ('color', 'Move',            'MOVE',   56),
  ('color', 'Peach 2',         'PEACH2', 57),
  ('color', 'Peach 3',         'PEACH3', 58),
  ('color', 'Gajri 2',         'GAJRI2', 59),
  ('color', 'Gajri 3',         'GAJRI3', 60),
  ('color', 'Golden 3',        'GOLD3',  61),
  ('color', 'Golden 4',        'GOLD4',  62),
  ('color', 'Silver 3',        'SILVER3',63),
  ('color', 'Silver 4',        'SILVER4',64),
  ('color', 'Mint 2',          'MINT2',  65),
  ('color', 'Dual Tone',       'DTONE',  66),
  ('color', 'Red 2',           'RED2',   67),
  ('color', 'Lavender 2',      'LAV2',   68),
  ('color', 'Golden 5',        'GOLD5',  69),
  ('color', 'Light Golden',    'LGOLD',  70),
  ('color', 'Feroji',          'FEROJI', 71),
  ('color', 'Black and White', 'BWHITE', 72),
  ('color', 'Rumi Mint',       'RMINT',  73),
  ('color', 'Ruby 2',          'RUBY2',  74),
  ('color', 'Green Mint',      'GMINT',  75)
on conflict (kind, value) do update set
  barcode_code = excluded.barcode_code,
  sort         = excluded.sort;


-- ------------------------------------------------------------ 0017_order_gst_mode.sql
-- Pillar 3 — explicit GST presentation mode per order.
--
-- Requirement: the TAX INVOICE should be GST-exclusive (rate is the pre-tax taxable value,
-- GST shown added on top), while the D2C storefront price stays inclusive of tax.
--
-- Until now the invoice inferred this only from the channel (wholesale = exclusive,
-- retail = inclusive). That left no way to issue a GST-exclusive tax invoice for a
-- retail/POS sale to a registered buyer. This column lets the owner pin it per bill:
--   NULL        → auto (wholesale = exclusive, retail/pos = inclusive) — existing behaviour
--   'exclusive' → GST added on top of the rate (taxable + GST = grand total)
--   'inclusive' → rate already includes GST (back-computed) — shelf-price behaviour
--
-- Idempotent + additive; no backfill so every existing order keeps its current (auto) look.

alter table public.orders add column if not exists gst_mode text;

do $$ begin
  alter table public.orders add constraint orders_gst_mode_chk
    check (gst_mode is null or gst_mode in ('inclusive','exclusive'));
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 0018_checkout_intents.sql
-- Pillar 9/online payments — make UPI/Razorpay payments un-loseable.
--
-- Problem: with UPI the customer is bounced to their UPI app (GPay/PhonePe) to approve,
-- then bounced back to the site. If they approve but close the tab / lose network before
-- returning, Razorpay has CAPTURED the money (payment_capture: 1) but our browser-side
-- handler never runs, so the order is never recorded. "Paid but no order."
--
-- Fix: when checkout starts we persist the cart + customer + amount against the Razorpay
-- order id as a "checkout intent". The Razorpay WEBHOOK (server-to-server, fires even if
-- the customer's tab is gone) can then look it up and place the order. Both the browser
-- handler and the webhook funnel through one finaliser that claims the intent first, so an
-- order is placed exactly once.

create table if not exists public.checkout_intents (
  id uuid primary key default uuid_generate_v4(),
  razorpay_order_id text not null unique,
  items jsonb not null,                 -- [{sku, qty, color?}]
  customer jsonb not null,              -- {name, phone, address, pincode?, city?}
  amount integer not null,              -- paise, server-authoritative (items + shipping)
  status text not null default 'pending',  -- pending | placing | placed
  order_id uuid references public.orders(id),
  payment_ref text,                     -- razorpay payment id once captured
  created_at timestamptz not null default now(),
  placed_at timestamptz
);

create index if not exists idx_checkout_intents_status on public.checkout_intents(status);

do $$ begin
  alter table public.checkout_intents add constraint checkout_intents_status_chk
    check (status in ('pending','placing','placed'));
exception when duplicate_object then null; end $$;

-- All access is via the service-role client (server actions + the webhook route), which
-- bypasses RLS. Enable RLS with NO public policies so the anon/browser key can never read
-- customer details or carts.
alter table public.checkout_intents enable row level security;


-- ------------------------------------------------------------ 0019_product_submissions.sql
-- 0019 — "Sell with us" intake: products submitted BY customers (storefront) and
-- approved wholesalers (trade panel). Submissions land here as 'pending' and are reviewed
-- in the admin console; on approval they become a DRAFT product in the catalogue.
--
-- Money columns are integer paise (store convention). Reuses the approval_status enum
-- (pending|approved|rejected) created in 0001_init.sql.

create table if not exists public.product_submissions (
  id uuid primary key default uuid_generate_v4(),
  channel text not null default 'retail',          -- 'retail' (storefront) | 'wholesale' (trade panel)
  -- Submitter identity. submitter_customer_id is set (no FK, to stay decoupled from the CRM
  -- customers table) when an approved wholesaler submits while logged in.
  submitter_customer_id uuid,
  submitter_name text,
  submitter_phone text,
  submitter_email text,
  -- The proposed product.
  product_name text not null,
  category_id uuid references categories(id),
  category_other text,                             -- free-text category hint when not in the list
  description text,
  color text,
  asking_price integer,                            -- paise — the price the seller is asking
  qty integer not null default 0,
  image_path text,                                 -- public URL in the product-media bucket
  -- Review workflow.
  status approval_status not null default 'pending',
  review_note text,
  created_product_sku text,                        -- SKU of the catalogue product created on approval
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists idx_product_submissions_status on public.product_submissions(status);
create index if not exists idx_product_submissions_created on public.product_submissions(created_at desc);

alter table public.product_submissions enable row level security;
-- Anyone (anon storefront visitor or logged-in wholesaler) may SUBMIT a product.
-- All reads and review decisions go through the service-role client in server actions.
drop policy if exists product_submissions_insert on public.product_submissions;
create policy product_submissions_insert on public.product_submissions for insert with check (true);


-- ------------------------------------------------------------ 0020_order_backorder.sql
-- Module — Backorder access.
-- When a POS sale is billed beyond available stock (the owner ticks "bill anyway as a
-- backorder"), flag the order so it surfaces on /admin/backorders. Stock itself stays
-- floored at 0 (migration 0015); this flag is how the owner finds what's owed/pending.
-- Idempotent: safe to re-run.

alter table public.orders
  add column if not exists is_backorder boolean not null default false;

-- Partial index so the backorders screen lists only flagged orders fast.
create index if not exists orders_is_backorder_idx
  on public.orders (created_at desc)
  where is_backorder;


-- ------------------------------------------------------------ 0021_billing_charges.sql
-- Meeting 2 §1 — extra billing charges: Packing / Courier / Adjustment.
-- These are GST-applicable, so they are folded into the document TOTAL (GST is computed on the
-- total) and itemised on the invoice. Stored in paise on both orders and estimates.
-- Adjustment may be negative (a round-off or concession). Idempotent — safe to re-run.

alter table public.orders     add column if not exists extra_packing    bigint not null default 0;
alter table public.orders     add column if not exists extra_courier    bigint not null default 0;
alter table public.orders     add column if not exists extra_adjustment bigint not null default 0;

alter table public.estimates  add column if not exists extra_packing    bigint not null default 0;
alter table public.estimates  add column if not exists extra_courier    bigint not null default 0;
alter table public.estimates  add column if not exists extra_adjustment bigint not null default 0;


-- ------------------------------------------------------------ 0022_product_retail_only.sql
-- Meeting 2 §4 — per-storefront product visibility.
-- `wholesale_only` already hides a product from the retail (D2C) shop. This adds the symmetric
-- `retail_only` to hide it from the wholesale portal. Visibility is now 3-way:
--   both (default · neither flag) / wholesale-only / retail-only.
-- Admin/POS still see every product; only the customer-facing wholesale store filters retail-only.
-- Idempotent — safe to re-run.

alter table public.products add column if not exists retail_only boolean not null default false;


-- ------------------------------------------------------------ 0023_wholesale_min_order.sql
-- Meeting 2 §7 — configurable minimum wholesale order value (was hardcoded ₹3,000).
-- Stored in paise on the single pricing_settings row; editable from /admin/pricing.
-- Idempotent — safe to re-run.

alter table public.pricing_settings add column if not exists wholesale_min_order bigint not null default 300000;


-- ------------------------------------------------------------ 0024_notify_requests.sql
-- Meeting 2 §7/§10 — "Notify Me" demand capture for out-of-stock products.
-- A storefront customer leaves their phone against an out-of-stock product; the owner sees the
-- pent-up demand (which product, who, how many) in Admin → Notify-Me. Idempotent.

create table if not exists public.notify_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  sku text,
  customer_name text,
  customer_phone text,
  created_at timestamptz not null default now()
);
create index if not exists notify_requests_sku_idx on public.notify_requests (sku);
create index if not exists notify_requests_created_idx on public.notify_requests (created_at desc);


-- ------------------------------------------------------------ 0025_payment_methods.sql
-- Meeting 2 §1 (POS) — owner-managed bank / payment methods.
-- The owner adds the banks / UPI handles they collect into; at billing the cashier marks which
-- one received the money (orders.payment_method), and Bank & Cash breaks the bank total down per
-- method. Cash stays implicit. Idempotent — safe to re-run.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'bank',   -- 'bank' | 'upi' | 'wallet'
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- Which bank/UPI method received the non-cash portion of a sale (null = cash-only / unassigned).
alter table public.orders add column if not exists payment_method text;


-- ------------------------------------------------------------ 0026_trade_pricing_column_lockdown.sql
-- Aggarwal Jewellers — 0026: DB-level isolation of TRADE (wholesale/cost) pricing.
--
-- ADDITIVE + IDEMPOTENT + SAFE for the running app.
--
-- WHY THIS EXISTS
-- ----------------
-- `products` keeps a PUBLIC-READ RLS policy (0001) so the storefront, sitemap and crawlers
-- can read published catalogue rows with the anon key. RLS is ROW-level, not column-level —
-- so that same public policy also exposed the trade-cost columns (`base_wholesale` and the
-- per-product / per-variant override prices) to anyone holding the anon key + project URL.
-- That is exactly the wholesale-pricing leak the retail/dealer split must close.
--
-- The app itself never reads these tables with the anon key (it uses the SERVICE-ROLE key on
-- the server, which bypasses RLS and column grants), so removing anon/authenticated access to
-- the cost columns changes nothing for legitimate traffic — it only slams the door on direct
-- anon-key scraping of trade prices. Enforcement is server-side; no client-side filtering.
--
-- MECHANISM
-- ----------
-- A blanket table-level SELECT grant cannot be narrowed by a column-level REVOKE, so we drop
-- the blanket grant and re-grant SELECT on ONLY the non-sensitive columns. Future columns are
-- therefore private-by-default to public roles until explicitly granted — the safe direction.

do $$
begin
  -- ---- PRODUCTS ----------------------------------------------------------------------------
  revoke select on public.products from anon, authenticated;
  grant select (
    id, category_id, sku, name, type, qty, status,
    generated_content, embedding, last_movement_at, created_at,
    wholesale_only, retail_only
    -- intentionally NOT granted: base_wholesale, wholesale_override, retail_override, mrp_override
  ) on public.products to anon, authenticated;

  -- ---- VARIANTS ----------------------------------------------------------------------------
  revoke select on public.variants from anon, authenticated;
  grant select (
    id, product_id, color, sku, qty, image_paths, size, polish
    -- intentionally NOT granted: wholesale_override, retail_override, mrp_override
  ) on public.variants to anon, authenticated;
end $$;

-- ---- Re-assert RLS on the dealer-identity + order tables (already enabled in 0005) ----------
-- `customers` holds login_code + wholesale_approved (the dealer credential & approval flag);
-- orders/order_items hold trade order values. RLS-enabled with NO policy = deny-all to anon,
-- which is what we want: only the service-role server may read them.
do $$
declare t text;
begin
  foreach t in array array['customers','orders','order_items','retailers'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------ 0027_payment_methods_v2.sql
-- Aggarwal Jewellers — 0027: Centralized Payment Methods (single source of truth) · Phase 1.
--
-- ADDITIVE + IDEMPOTENT + BACKWARD-COMPATIBLE.
--
-- Extends the basic 0025 `payment_methods` into the master payment-method registry, adds a
-- normalized transaction ledger + a transfers table, and exposes per-method balances as a
-- drift-free VIEW (opening_balance + Σin − Σout). The legacy cash/bank model (orders.pay_cash /
-- pay_bank, doc_settings opening, cash_bank_summary) is left fully intact and kept in sync by the
-- app, so existing reports/dashboard never break. A one-time backfill seeds historical SALES into
-- the new ledger. Historical orders are NEVER modified.

-- 1) ENRICH payment_methods --------------------------------------------------------------------
-- `kind` (from 0025) is the Type: cash | bank | upi | wallet | card | cheque | razorpay | other.
-- `active`, `sort` (display order) and `created_at` already exist.
alter table public.payment_methods add column if not exists bank_name       text;
alter table public.payment_methods add column if not exists account_name    text;
alter table public.payment_methods add column if not exists account_number  text;
alter table public.payment_methods add column if not exists upi_id          text;
alter table public.payment_methods add column if not exists qr_code_url     text;
alter table public.payment_methods add column if not exists branch          text;
alter table public.payment_methods add column if not exists opening_balance bigint  not null default 0;  -- paise
alter table public.payment_methods add column if not exists archived        boolean not null default false;
alter table public.payment_methods add column if not exists is_default      boolean not null default false;
alter table public.payment_methods add column if not exists color           text;
alter table public.payment_methods add column if not exists icon            text;
alter table public.payment_methods add column if not exists notes           text;
alter table public.payment_methods add column if not exists created_by      text;

-- Seed an implicit Cash method (the default tender) if the registry has none.
insert into public.payment_methods (name, kind, sort, is_default, active)
select 'Cash', 'cash', 0, true, true
where not exists (select 1 from public.payment_methods where lower(kind) = 'cash');

-- 2) LEDGER — every money movement references exactly one method --------------------------------
create table if not exists public.payment_method_transactions (
  id          uuid primary key default gen_random_uuid(),
  method_id   uuid references public.payment_methods(id) on delete set null,
  txn_type    text not null,            -- sale | purchase | expense | transfer_in | transfer_out | refund | adjustment | opening
  direction   text not null,            -- in | out
  amount      bigint not null,          -- paise, always > 0 (direction carries the sign)
  ref_type    text,                     -- order | supplier_payment | transfer | manual | ...
  ref_id      uuid,
  note        text,
  occurred_at timestamptz not null default now(),
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pmt_method on public.payment_method_transactions(method_id, occurred_at);
create index if not exists idx_pmt_ref    on public.payment_method_transactions(ref_type, ref_id);

-- 3) TRANSFERS — internal account-to-account moves (schema ready; UI in Phase 2) ----------------
create table if not exists public.payment_method_transfers (
  id          uuid primary key default gen_random_uuid(),
  from_method uuid references public.payment_methods(id) on delete set null,
  to_method   uuid references public.payment_methods(id) on delete set null,
  amount      bigint not null,          -- paise
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- 4) BALANCES — derived VIEW (no trigger drift; the single source of truth for current balance) -
create or replace view public.payment_method_balances as
select
  m.id   as method_id,
  m.name,
  m.kind,
  m.opening_balance,
  coalesce(sum(case when t.direction = 'in'  then t.amount else 0 end), 0) as total_in,
  coalesce(sum(case when t.direction = 'out' then t.amount else 0 end), 0) as total_out,
  m.opening_balance
    + coalesce(sum(case when t.direction = 'in'  then t.amount else 0 end), 0)
    - coalesce(sum(case when t.direction = 'out' then t.amount else 0 end), 0) as current_balance
from public.payment_methods m
left join public.payment_method_transactions t on t.method_id = m.id
group by m.id;

-- 5) RLS — service-role only, consistent with 0005 (deny-all to anon) ---------------------------
alter table public.payment_method_transactions enable row level security;
alter table public.payment_method_transfers   enable row level security;

-- 6) ONE-TIME BACKFILL of historical SALES into the ledger --------------------------------------
-- Cash portion of every past order → the Cash method; bank portion → the named method (matched by
-- name), else NULL (= Unassigned bank receipt). Guarded to run only once (ledger still empty).
do $$
declare cash_id uuid;
begin
  if exists (select 1 from public.payment_method_transactions limit 1) then
    return;  -- already backfilled
  end if;
  select id into cash_id from public.payment_methods where lower(kind) = 'cash' order by sort limit 1;

  insert into public.payment_method_transactions (method_id, txn_type, direction, amount, ref_type, ref_id, note, occurred_at)
  select cash_id, 'sale', 'in', o.pay_cash, 'order', o.id,
         coalesce(o.invoice_no, left(o.id::text, 8)), o.created_at
  from public.orders o
  where coalesce(o.pay_cash, 0) > 0;

  insert into public.payment_method_transactions (method_id, txn_type, direction, amount, ref_type, ref_id, note, occurred_at)
  select pm.id, 'sale', 'in', o.pay_bank, 'order', o.id,
         coalesce(o.invoice_no, left(o.id::text, 8)), o.created_at
  from public.orders o
  left join public.payment_methods pm on pm.name = o.payment_method
  where coalesce(o.pay_bank, 0) > 0;
end $$;


-- ------------------------------------------------------------ 0028_stock_ledger.sql
-- Aggarwal Jewellers — 0028: Product Stock Ledger support · ENRICHES the existing movement ledger.
--
-- ADDITIVE + IDEMPOTENT. No new movement table — the Product Stock Ledger is DERIVED from the
-- existing public.stock_adjustments rows (one row per inventory event). These columns just let
-- each movement carry its source document + actor, and give products an owner-set reorder point,
-- so the ledger header / audit / related-document links are complete.

-- Source-document reference (order / purchase / estimate id). Used by the "Related documents"
-- links. Guarded so it's a no-op if the deployed DB already added it.
alter table public.stock_adjustments add column if not exists ref_id     uuid;

-- Audit: who created the movement (POS cashier, owner, DIVA, bulk import…).
alter table public.stock_adjustments add column if not exists created_by text;

-- Owner-set reorder level per product (header shows it; NULL = not set).
alter table public.products add column if not exists reorder_level integer;

-- The ledger reads a single product's history in chronological order to compute running balances.
create index if not exists idx_stock_adj_product_created on public.stock_adjustments(product_id, created_at);


-- ------------------------------------------------------------ 0029_pim_extension.sql
-- Aggarwal Jewellers — 0029: Product Management System (PIM) · Phase 1 extension tables.
--
-- ADDITIVE + IDEMPOTENT + BACKWARD-COMPATIBLE.
--
-- We do NOT rebuild products/variants. The storefront + POS keep reading the existing columns
-- (name, sku, qty, status, base_wholesale, *_override, wholesale_only, retail_only). These new
-- tables hold the richer PIM attributes and the INDEPENDENT retail/wholesale settings; the save
-- actions keep products.wholesale_only / retail_only / status in sync from the channel settings,
-- so nothing downstream breaks.

-- 1) Per-product attribute sheet (1:1 with products) -------------------------------------------
create table if not exists public.product_details (
  product_id        uuid primary key references public.products(id) on delete cascade,
  product_code      text,
  internal_sku      text,
  collection        text,
  brand             text,
  vendor            text,
  supplier          text,
  short_description text,
  weight_grams      numeric,
  length_mm         numeric,
  width_mm          numeric,
  height_mm         numeric,
  material          text,
  occasion          text,
  gst_pct           numeric,
  hsn_code          text,
  country_of_origin text,
  -- richer lifecycle than the products.status enum (draft|published|archived|discontinued)
  lifecycle         text not null default 'draft',
  -- pricing extras (the base cost + overrides stay on products/variants)
  retail_discount_pct  numeric,
  moq                  integer,
  bulk_discount_pct    numeric,
  dealer_margin_pct    numeric,
  wholesale_tier       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2) Independent retail / wholesale storefront settings (one row per channel) -------------------
create table if not exists public.product_channel_settings (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  channel       text not null,                 -- 'retail' | 'wholesale'
  visible       boolean not null default true,
  featured      boolean not null default false,
  dealer_only   boolean not null default false, -- wholesale
  show_in_search      boolean not null default true,
  show_in_collections boolean not null default true,
  allow_reviews       boolean not null default true,
  allow_wishlist      boolean not null default true,
  show_price          boolean not null default true,
  show_discount       boolean not null default true,
  show_related        boolean not null default true,
  trade_price_visible boolean not null default true,  -- wholesale
  retail_price_hidden boolean not null default false, -- wholesale
  description    text,
  specifications text,
  trade_notes    text,        -- wholesale
  dealer_tags    text,        -- wholesale
  collections    text,        -- wholesale collections
  badges         text,        -- retail badges
  seo_title      text,
  meta_description text,
  url_slug       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, channel)
);
create index if not exists idx_pcs_product on public.product_channel_settings(product_id);

-- 3) Per-variant independent visibility (hide one colour from retail, keep it for wholesale) ----
create table if not exists public.variant_channel_settings (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.variants(id) on delete cascade,
  channel     text not null,                   -- 'retail' | 'wholesale'
  visible     boolean not null default true,
  sort_order  integer,
  unique (variant_id, channel)
);
create index if not exists idx_vcs_variant on public.variant_channel_settings(variant_id);

-- 4) Inventory-tab fields on products (additive; qty + reorder_level already exist) -------------
alter table public.products add column if not exists min_stock            integer;
alter table public.products add column if not exists max_stock            integer;
alter table public.products add column if not exists warehouse            text;
alter table public.products add column if not exists barcode              text;
alter table public.products add column if not exists track_inventory      boolean not null default true;
alter table public.products add column if not exists continue_selling_oos boolean not null default false;
alter table public.products add column if not exists allow_backorders     boolean not null default false;

-- 5) RLS — service-role only, consistent with 0005 --------------------------------------------
alter table public.product_details          enable row level security;
alter table public.product_channel_settings enable row level security;
alter table public.variant_channel_settings enable row level security;

-- 6) Seed channel rows for existing products from current flags (one-time, idempotent) ---------
-- retail row: visible unless the product is wholesale_only; wholesale row: visible unless retail_only.
insert into public.product_channel_settings (product_id, channel, visible)
select p.id, 'retail', not coalesce(p.wholesale_only, false)
from public.products p
on conflict (product_id, channel) do nothing;

insert into public.product_channel_settings (product_id, channel, visible, dealer_only)
select p.id, 'wholesale', not coalesce(p.retail_only, false), false
from public.products p
on conflict (product_id, channel) do nothing;

-- seed a details row per product so the editor always has a record to update
insert into public.product_details (product_id, lifecycle)
select p.id, case when p.status = 'published' then 'published' else 'draft' end
from public.products p
on conflict (product_id) do nothing;


-- ------------------------------------------------------------ 0030_image_generations.sql
-- Aggarwal Jewellers — 0030: AI Jewellery Photography Studio · generation ledger.
--
-- ADDITIVE + IDEMPOTENT + BACKWARD-COMPATIBLE.
--
-- The storefront keeps reading product_images (unchanged). This table records every AI
-- generation as an immutable CANDIDATE — so Regenerate NEVER overwrites: each click appends a
-- new version. Publishing a candidate copies its URL into product_images (the storefront source).

create table if not exists public.image_generations (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  variant_id    uuid references public.variants(id) on delete set null,
  raw_image_path text,                 -- the reference (raw) image used
  output_path   text,                  -- generated image public URL (null while pending/failed)
  shot_type     text not null default 'hero',  -- hero|closeup|lifestyle|side|angle45|back|detail|model|catalog_white|transparent|social_crop|enhance_*
  prompt        text,
  settings      jsonb not null default '{}'::jsonb,  -- lighting, model_style, background, focus, ethnicity, pose, lens, mood, luxury, emphasis…
  detected      jsonb,                 -- AI auto-detect: {category, material, style, attributes[]}
  provider      text,                  -- gemini:model | openai:model
  version       integer not null default 1,         -- per (product, shot_type)
  status        text not null default 'candidate',  -- candidate|favorite|published|rejected|archived
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_imggen_product on public.image_generations(product_id, shot_type, created_at desc);
create index if not exists idx_imggen_status  on public.image_generations(status);

-- Link a published storefront image back to the generation it came from + variant association.
alter table public.product_images add column if not exists variant_id    uuid references public.variants(id) on delete set null;
alter table public.product_images add column if not exists generation_id uuid references public.image_generations(id) on delete set null;
alter table public.product_images add column if not exists metadata      jsonb;

-- RLS — service-role only (consistent with 0005).
alter table public.image_generations enable row level security;


-- ------------------------------------------------------------ 0031_colours_master_fixed.sql
-- 0031_colours_master_fixed.sql
-- The colours master is FIXED: 75 approved colours, each with its scanner barcode code.
-- "Oxidised" is a POLISH/finish, not a colour. Idempotent — safe to re-run.

begin;

-- 0) Ensure the barcode_code column exists (some environments never applied the 0015 column add).
alter table public.variant_options add column if not exists barcode_code text;

-- 1) Oxidised (either spelling) must never be a colour; it is a polish.
delete from public.variant_options where kind = 'color' and lower(value) in ('oxidised','oxidized');
insert into public.variant_options (kind, value) values ('polish', 'Oxidised')
  on conflict (kind, value) do nothing;

-- 2) Drop the legacy mis-spelling so the canonical name below is the only one.
delete from public.variant_options where kind = 'color' and lower(value) = 'rumi mint';

-- 3) Lock the canonical colour list + barcode codes (insert missing, correct any drifted code).
insert into public.variant_options (kind, value, barcode_code) values
  ('color', 'Red', 'RED'),
  ('color', 'Green', 'GREEN'),
  ('color', 'Yellow', 'YELLOW'),
  ('color', 'Black', 'BLACK'),
  ('color', 'White', 'WHITE'),
  ('color', 'Wine', 'WINE'),
  ('color', 'Purple', 'PURPLE'),
  ('color', 'Mint', 'MINT'),
  ('color', 'Peach', 'PEACH'),
  ('color', 'Multicolor 1', 'MULTI1'),
  ('color', 'Multicolor 2', 'MULTI2'),
  ('color', 'Sky Blue', 'SBLUE'),
  ('color', 'Royal Blue', 'RBLUE'),
  ('color', 'Navy Blue', 'NBLUE'),
  ('color', 'Maroon', 'MAROON'),
  ('color', 'Peacock Green', 'PGREEN'),
  ('color', 'Silver', 'SILVER'),
  ('color', 'Golden', 'GOLD'),
  ('color', 'Lavender', 'LAV'),
  ('color', 'Blush Pink', 'PINK'),
  ('color', 'Magenta', 'RANI'),
  ('color', 'Orange', 'ORANGE'),
  ('color', 'Ruby', 'RUBY'),
  ('color', 'Mehndi', 'MEH'),
  ('color', 'Pink Mint', 'PMINT'),
  ('color', 'Grey', 'GREY'),
  ('color', 'Gajri', 'GAJRI'),
  ('color', 'Peacock Blue', 'PBLUE'),
  ('color', 'Baby Pink', 'BPINK'),
  ('color', 'Maroon Green', 'MGREEN'),
  ('color', 'White Maroon', 'WMAROON'),
  ('color', 'White Green', 'WGREEN'),
  ('color', 'White Magenta', 'WRANI'),
  ('color', 'White Red', 'WRED'),
  ('color', 'White Pink Mint', 'WPMINT'),
  ('color', 'White Multi', 'WMULTI'),
  ('color', 'Rose Gold', 'RGOLD'),
  ('color', 'Teal Green', 'TGREEN'),
  ('color', 'Green Red', 'GRED'),
  ('color', 'Ruby Green', 'RGREEN'),
  ('color', 'Brown', 'BROWN'),
  ('color', 'All', 'ALL'),
  ('color', 'Lemon', 'LEMON'),
  ('color', 'Mustard', 'MUSTARD'),
  ('color', 'Off White', 'OWHITE'),
  ('color', 'Matte Gold', 'MGOLD'),
  ('color', 'Rainbow', 'RAIN'),
  ('color', 'Pearl', 'PEARL'),
  ('color', 'Matte Silver', 'MSLVER'),
  ('color', 'Multicolor 3', 'MULTI3'),
  ('color', 'Multicolor 4', 'MULTI4'),
  ('color', 'Multicolor 5', 'MULTI5'),
  ('color', 'Golden 2', 'GOLD2'),
  ('color', 'Silver 2', 'SILVER2'),
  ('color', 'Ocean Blue', 'OBLUE'),
  ('color', 'Move', 'MOVE'),
  ('color', 'Peach 2', 'PEACH2'),
  ('color', 'Peach 3', 'PEACH3'),
  ('color', 'Gajri 2', 'GAJRI2'),
  ('color', 'Gajri 3', 'GAJRI3'),
  ('color', 'Golden 3', 'GOLD3'),
  ('color', 'Golden 4', 'GOLD4'),
  ('color', 'Silver 3', 'SILVER3'),
  ('color', 'Silver 4', 'SILVER4'),
  ('color', 'Mint 2', 'MINT2'),
  ('color', 'Dual Tone', 'DTONE'),
  ('color', 'Red 2', 'RED2'),
  ('color', 'Lavender 2', 'LAV2'),
  ('color', 'Golden 5', 'GOLD5'),
  ('color', 'Light Golden', 'LGOLD'),
  ('color', 'Feroji', 'FEROJI'),
  ('color', 'Black and White', 'BWHITE'),
  ('color', 'Ruby Mint', 'RMINT'),
  ('color', 'Ruby 2', 'RUBY2'),
  ('color', 'Green Mint', 'GMINT')
on conflict (kind, value) do update set barcode_code = excluded.barcode_code;

commit;


-- ------------------------------------------------------------ 0031_image_refine.sql
-- Aggarwal Jewellers — 0031: region-based "Fix a detail" edits on generated images.
--
-- ADDITIVE + IDEMPOTENT + BACKWARD-COMPATIBLE.
--
-- A "refine" is a SURGICAL local edit of an existing candidate: the owner marks the wrong
-- area (e.g. a mis-generated pendant) and types what it should be. The AI edits ONLY that
-- region, re-anchored to the ORIGINAL raw reference, and the result is saved as a NEW
-- candidate linked back to its parent — so nothing is ever overwritten (same rule as 0030).

alter table public.image_generations add column if not exists parent_id        uuid references public.image_generations(id) on delete set null;
alter table public.image_generations add column if not exists edit_instruction text;    -- the owner's correction, e.g. "make the bottom heart an open outline"
alter table public.image_generations add column if not exists edit_region      jsonb;   -- normalised {x,y,w,h} (0..1) of the marked area, or null for a whole-image fix

create index if not exists idx_imggen_parent on public.image_generations(parent_id);


-- ------------------------------------------------------------ 0032_charm_rounding.sql
-- Aggarwal Jewellers — 0032: charm rounding on the final displayed/charged prices.
--
-- Owner's rule: after the build-up formula runs, the RETAIL selling price must end in 9
-- (₹126 → ₹129) and the printed MRP must be a round multiple of 5 (ends in 0/5). This mirrors
-- the JS engine in lib/pricing.ts (roundRetailCharmPaise / roundMrpTo5Paise) EXACTLY, so that
-- online order placement (place_order) and POS estimates (create_estimate) — which price through
-- bd_price() in the DB — record the same totals the storefront shows. Values are integer paise.
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE only; no data change.
CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; bump int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 10) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 2.2);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 2.75);
  end if;

  -- RETAIL: charm-round UP to the next whole rupee ending in 9 (paise in / paise out).
  ret_rupees := greatest(1, round(retail_raw / 100.0)::int);
  bump       := ((9 - (ret_rupees % 10)) + 10) % 10;
  retail_out := (ret_rupees + bump) * 100;

  -- MRP: nearest whole rupee ending in 0/5, never printed below the retail selling price.
  mrp_rupees := round(mrp_raw / 100.0 / 5.0)::int * 5;
  if mrp_rupees <= 0 then mrp_rupees := 5; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 5.0)::int * 5) * 100;
  end if;

  return (case p_tier
            when 'wholesale' then wholesale_out
            when 'mrp' then mrp_out
            else retail_out end)::int;
end; $function$;


-- ------------------------------------------------------------ 0032_styles.sql
-- 0032_styles.sql
-- A second product taxonomy dimension: STYLE (e.g. Choker, Long Necklace, Round Neck Set),
-- separate from the "type" subcategory. Mainly used on Necklace / Earrings. A product carries one
-- primary style; the storefront & wholesale can then filter on TYPE (subcategory) + STYLE + colour.
-- Idempotent.

begin;

create table if not exists public.styles (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists styles_category_slug_uidx on public.styles (category_id, slug);

alter table public.products add column if not exists style_id uuid references public.styles(id) on delete set null;
create index if not exists products_style_id_idx on public.products (style_id);

commit;


-- ------------------------------------------------------------ 0033_fix_bd_price_wholesale_equals_cost.sql
-- Aggarwal Jewellers — 0033: make the DB pricing function agree with the app (cost = wholesale price).
--
-- Bug: bd_price() (used by place_order / place_wholesale_order / create_estimate) still built the
-- wholesale rate UP from the entered cost through shipping/packing/promotion/reseller, so a ₹200
-- entry billed ₹310 wholesale — while the app (lib/pricing computePrices) now treats the entered
-- value AS the wholesale price (₹200). The storefront showed ₹200 but orders charged ₹310.
--
-- Fix: in the % build-up mode, WHOLESALE = the entered base (the owner's rule "the cost is the
-- wholesale price"). Retail = wholesale + customer-step % (rounded to end in ₹9). MRP = retail +
-- markup % (rounded to nearest ₹5). This mirrors lib/pricing.ts exactly, so screen == invoice.
-- The old multiplier mode (build-up OFF) is unchanged. Idempotent (CREATE OR REPLACE).

create or replace function public.bd_price(p_base integer, p_tier text)
returns integer
language plpgsql
stable
as $function$
declare
  ps record;
  v_round int;
  v_w numeric; v_r numeric; v_m numeric; v_out numeric;
  retail_raw numeric;  -- paise, unrounded retail
  mrp_raw numeric;     -- paise, unrounded mrp
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    -- The entered base IS the wholesale price (cost = wholesale).
    retail_raw := p_base::numeric * (1 + coalesce(ps.customer_discount_pct,0)/100);
    mrp_raw    := retail_raw      * (1 + coalesce(ps.mrp_pct,0)/100);
    v_w := round(p_base::numeric / v_round) * v_round;                       -- nearest ₹1
    v_r := greatest(9, round((retail_raw/100 - 9)/10) * 10 + 9) * 100;       -- ends in ₹9
    v_m := greatest(5, round((mrp_raw/100) / 5) * 5) * 100;                  -- nearest ₹5
    v_out := case p_tier when 'wholesale' then v_w when 'mrp' then v_m else v_r end;
    return v_out::int;
  else
    v_w := p_base * (1 + coalesce(ps.wholesale_markup_pct,10)/100);
    v_r := p_base * coalesce(ps.retail_multiplier,2.2);
    v_m := p_base * coalesce(ps.mrp_multiplier,2.75);
    v_out := case p_tier when 'wholesale' then v_w when 'mrp' then v_m else v_r end;
    return (round(v_out / v_round) * v_round)::int;
  end if;
end; $function$;


-- ------------------------------------------------------------ 0033_pricing_flat_charges.sql
-- 0033_pricing_flat_charges.sql
-- Packing & Promotion in the pricing build-up become FLAT ₹ charges (stored in paise) instead of
-- percentages. Retail now rounds to prices ending in 9, MRP to the nearest 5 (handled in code).
-- Idempotent.
begin;
alter table public.pricing_settings add column if not exists packing_flat   integer not null default 2500; -- ₹25
alter table public.pricing_settings add column if not exists promotion_flat integer not null default 2500; -- ₹25
commit;


-- ------------------------------------------------------------ 0033_product_thumbnail.sql
-- Aggarwal Jewellers — 0033: owner-chosen storefront cover image.
--
-- ADDITIVE + IDEMPOTENT. When set, products.thumbnail_path is the exact image URL the storefront
-- uses as the product's card thumbnail (and the leading gallery image), overriding the automatic
-- "first generated image" pick. The owner may choose ANY of the product's images — including a
-- specific colour/variant photo — from the Photo Studio. NULL = automatic (previous behaviour).
alter table public.products add column if not exists thumbnail_path text;


-- ------------------------------------------------------------ 0034_accounting_audit.sql
-- Aggarwal Jewellers — 0034: Accounting & ERP audit fixes (applied to production 2026-07-01).
-- Idempotent. Keeps the repo in sync with the live database.

-- 1) Sales returns now record a STOCK MOVEMENT (every inventory change must have a source).
--    Previously record_sales_return changed products.qty directly with no stock_adjustments row,
--    so returns never showed in Stock Movement / the Product Ledger and drifted inventory.
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
  insert into audit_log(actor, action, ref, detail) values('staff','sales_return', v_id::text, p_reason);
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $function$;

-- 2) Read-only VALIDATION views — surface accounting/inventory inconsistencies automatically.
create or replace view public.v_inventory_reconciliation as
with mv as (select product_id, coalesce(sum(delta),0) as moved from stock_adjustments group by product_id)
select p.id as product_id, p.sku, p.name, p.qty as on_hand,
       coalesce(mv.moved,0) as movement_sum, p.qty - coalesce(mv.moved,0) as drift
from products p left join mv on mv.product_id = p.id
where p.qty <> coalesce(mv.moved,0);

create or replace view public.v_overpaid_orders as
select id, invoice_no, customer_name, total, amount_paid, amount_paid - total as overpaid
from orders where coalesce(amount_paid,0) > coalesce(total,0);

create or replace view public.v_accounting_health as
select
  (select count(*) from v_inventory_reconciliation) as inventory_drift_products,
  (select count(*) from v_overpaid_orders) as overpaid_orders,
  (select count(*) from products where coalesce(qty,0) < 0) as negative_stock,
  (select count(*) from stock_adjustments where ref_id is null and kind in ('sale','purchase','return','estimate')) as movements_without_source,
  (select coalesce(sum(greatest(0, total-amount_paid)),0) from orders where status not in ('cancelled','void')) as receivable_paise,
  (select coalesce(sum(p.total),0) - coalesce((select sum(amount) from supplier_payments),0) from purchases p) as payable_paise;

-- 3) One-time reconciliation: post an 'audit' movement wherever stock was added historically
--    without a movement record, so the ledger sums to physical on-hand. Stock is NOT changed.
insert into stock_adjustments(product_id, sku, delta, kind, source, reason, created_by, created_at)
select product_id, sku, drift, 'audit', 'Opening reconciliation',
       'Auto-reconciled stock ledger to physical on-hand (accounting audit)', 'system', now()
from public.v_inventory_reconciliation where drift <> 0;

-- 4) Guard: recorded payment can never exceed the bill total (change is not revenue).
update orders set amount_paid = total, pay_cash = least(coalesce(pay_cash,0), total)
where coalesce(amount_paid,0) > coalesce(total,0);

create or replace function public.cap_amount_paid() returns trigger language plpgsql as $$
begin
  if new.total is not null and coalesce(new.amount_paid,0) > new.total then
    new.amount_paid := new.total;
  end if;
  return new;
end; $$;
drop trigger if exists trg_cap_amount_paid on orders;
create trigger trg_cap_amount_paid before insert or update on orders
  for each row execute function public.cap_amount_paid();


-- ------------------------------------------------------------ 0034_cap_amount_paid_gst.sql
-- Aggarwal Jewellers — 0034: fix the amount_paid cap for GST bills (root cause of the phantom GST balance).
--
-- The trg_cap_amount_paid trigger clamped amount_paid to the PRE-TAX `total`. On a GST tax invoice
-- the customer pays total + GST, so a fully-paid bill was silently reduced to the pre-tax figure,
-- leaving the GST amount showing as a fake "balance due" — even when the whole amount was paid in
-- cash. Cap at the correct ceiling instead:
--   • GST bill  -> rounded-to-₹1 GST-inclusive grand total (matches the printed invoice Grand Total
--                  and lib grandTotalPaise in app/actions/orders.ts)
--   • Cash memo -> the plain total (no tax)
create or replace function public.cap_amount_paid()
returns trigger
language plpgsql
as $function$
declare cap_paise int;
begin
  if new.total is not null then
    if coalesce(new.bill_type, 'gst') = 'gst' then
      cap_paise := (round((new.total + round(new.total * 0.03)) / 100.0) * 100)::int; -- grand total, nearest ₹1
    else
      cap_paise := new.total;
    end if;
    if coalesce(new.amount_paid, 0) > cap_paise then
      new.amount_paid := cap_paise;
    end if;
  end if;
  return new;
end; $function$;

-- Correct historical GST bills that were clamped to the pre-tax total but were actually paid in full
-- (the recorded tender already covers the grand total).
update orders
set amount_paid = (round((total + round(total*0.03))/100.0)*100)::int
where bill_type = 'gst'
  and amount_paid < (round((total + round(total*0.03))/100.0)*100)::int
  and (coalesce(pay_cash,0) + coalesce(pay_bank,0)) >= (round((total + round(total*0.03))/100.0)*100)::int;


-- ------------------------------------------------------------ 0035_bd_price_full_buildup.sql
-- Aggarwal Jewellers — 0035: bd_price() — the WHOLESALE billing price IS the value entered (owner's rule).
--
-- Final rule confirmed by the owner: whatever price is entered on a product is the wholesale price
-- charged at billing — NOT a cost that gets built up. Retail = +customer% (ends ₹9),
-- MRP = +mrp% (nearest ₹5). Mirrors lib/pricing.ts (computePrices + buildupBreakdown) and the
-- Pricing-formula page preview, so the screen, storefront and invoice all agree.
-- Enter ₹200 → wholesale ₹200 · retail ₹209 · MRP ₹265. Idempotent (CREATE OR REPLACE).

create or replace function public.bd_price(p_base integer, p_tier text)
returns integer language plpgsql stable as $function$
declare ps record; v_round int; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric; v_out numeric;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);
  if coalesce(ps.use_buildup, false) then
    retail_raw := p_base::numeric * (1 + coalesce(ps.customer_discount_pct,0)/100);
    mrp_raw    := retail_raw      * (1 + coalesce(ps.mrp_pct,0)/100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;              -- wholesale = entered value
    retail_out := greatest(9, round((retail_raw/100 - 9)/10) * 10 + 9) * 100; -- ends ₹9
    mrp_out    := greatest(5, round((mrp_raw/100) / 5) * 5) * 100;            -- nearest ₹5
    v_out := case p_tier when 'wholesale' then wholesale_out when 'mrp' then mrp_out else retail_out end;
    return v_out::int;
  else
    v_out := case p_tier
               when 'wholesale' then p_base * (1 + coalesce(ps.wholesale_markup_pct,10)/100)
               when 'mrp' then p_base * coalesce(ps.mrp_multiplier,2.75)
               else p_base * coalesce(ps.retail_multiplier,2.2) end;
    return (round(v_out / v_round) * v_round)::int;
  end if;
end; $function$;


-- ------------------------------------------------------------ 0035_sync_configurable_qty.sql
-- Aggarwal Jewellers — 0035: keep configurable-product stock in sync with its variants.
--
-- A configurable (colours) product holds stock per VARIANT; the product row's qty is just the sum.
-- An old Basic-tab edit could overwrite that total with a manual number, desyncing it from the real
-- per-colour stock. The app now derives it (updateProduct recomputes from variants; stock.ts rolls
-- up on every movement). This one-time sync corrects any historical drift. Safe + idempotent.
update products p
set qty = coalesce((select sum(v.qty) from variants v where v.product_id = p.id), 0)
where p.type = 'configurable';


-- ------------------------------------------------------------ 0036_bd_price_full_chain.sql
-- Aggarwal Jewellers — 0036: bd_price() rebuilt to the owner's FULL costing-sheet chain.
--
-- Base = the WHOLESALE price the client enters (what he sells to resellers at). Purchase-bill
-- price is reference-only and never feeds this. From the base W the retail & MRP are built up:
--   1. free shipping   W × (1 + shipping_pct%)
--   2. packing         + packing_flat   (flat paise)
--   3. promotion       + promotion_flat (flat paise)
--   4. reseller margin × (1 + reseller_pct%)
--   5. reseller-referral discount × (1 + customer_discount_pct%)  ==> RETAIL
--   6. mrp markup      × (1 + mrp_pct%)                            ==> MRP
-- Wholesale rate = W itself. Mirrors lib/pricing.ts buildupStages() exactly.
-- Defaults (10% / ₹25 / ₹25 / 15% / 5% / 25%) reproduce the sheet: ₹200 → wholesale 200, retail 326, MRP 408.
-- Idempotent (CREATE OR REPLACE).

create or replace function public.bd_price(p_base integer, p_tier text)
returns integer language plpgsql stable as $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric; v_out numeric;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);
  if coalesce(ps.use_buildup, false) then
    shipped      := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed       := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw   := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw      := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;  -- wholesale = entered value
    retail_out    := round(retail_raw / v_round) * v_round;
    mrp_out       := round(mrp_raw / v_round) * v_round;
    v_out := case p_tier when 'wholesale' then wholesale_out when 'mrp' then mrp_out else retail_out end;
    return v_out::int;
  else
    v_out := case p_tier
               when 'wholesale' then p_base * (1 + coalesce(ps.wholesale_markup_pct, 10) / 100)
               when 'mrp' then p_base * coalesce(ps.mrp_multiplier, 2.75)
               else p_base * coalesce(ps.retail_multiplier, 2.2) end;
    return (round(v_out / v_round) * v_round)::int;
  end if;
end; $function$;


-- ------------------------------------------------------------ 0036_promotions.sql
-- Aggarwal Jewellers — 0036: AI promotional posters / festive campaigns.
--
-- The owner types a rough idea; OpenAI refines it into a detailed poster prompt (grounded in the
-- live catalogue + the festival/theme); Gemini (Nano Banana) generates the poster; publishing places
-- it in the storefront and/or wholesale hero, optionally targeted to a category's page.
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text,
  prompt text,                         -- the owner's rough idea
  refined_prompt text,                 -- OpenAI-refined image-generation prompt
  image_path text,                     -- generated poster public URL
  target_category_id uuid references public.categories(id) on delete set null,
  cta_href text,                       -- where the banner links (defaults to the target category / shop)
  show_retail boolean not null default false,
  show_wholesale boolean not null default false,
  status text not null default 'draft',   -- draft | published | archived
  aspect text default '16:9',
  provider text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_promotions_status on public.promotions(status, created_at desc);
create index if not exists idx_promotions_target on public.promotions(target_category_id);
alter table public.promotions enable row level security;


-- ------------------------------------------------------------ 0037_employees_and_sales_attribution.sql
-- Aggarwal Jewellers — 0037: Employees (salespeople) + sales attribution.
--
-- The owner wants to (a) keep a roster of employees, and (b) at billing, record WHICH employee
-- dealt with the customer, so sales accumulate per employee for performance-based rewards.
-- Idempotent.

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  title text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every order can be attributed to the salesperson who rang it up (nullable — legacy orders + online).
alter table public.orders add column if not exists sales_employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_orders_sales_employee on public.orders(sales_employee_id);
-- Speeds up per-customer spend-in-period rollups used for promotional targeting on the Customers page.
create index if not exists idx_orders_customer_created on public.orders(customer_id, created_at);


-- ------------------------------------------------------------ 0038_order_item_unit_mrp.sql
-- Aggarwal Jewellers — 0038: per-line ORIGINAL rate on order_items.
--
-- Stores the pre-discount unit rate (paise) for a bill line, so the invoice / cash memo can show
-- Rate (original) → Discount → Amount (net). Null means "no discount" (original = unit_price).
-- Idempotent.
alter table public.order_items add column if not exists unit_mrp bigint;


-- ------------------------------------------------------------ 0039_product_admin_tags.sql
-- Aggarwal Jewellers — 0039: per-product internal admin tags/notes.
--
-- The owner keeps his own short status tags on a product (e.g. "inventory updated",
-- "variant images sorted"). Admin-only — shown in the Catalogue and on any product's admin
-- page, NEVER on the storefront. Idempotent.
alter table public.products add column if not exists admin_tags text[] not null default '{}';


-- ------------------------------------------------------------ 0040_aggarwal_engine_ddl.sql
-- ============================================================
-- PART 3 — Aggarwal engine DDL: tables & columns the app needs
-- (authored from the app code contracts; run after Parts 1-2)
-- ============================================================

-- Estimates can be denied by the owner.
alter type estimate_status add value if not exists 'denied';

-- ---------- customers (retail + wholesale parties) ----------
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text,
  phone text,
  type text not null default 'retail',              -- 'retail' | 'wholesale'
  gstin text,
  city text,
  credit_balance bigint not null default 0,          -- paise
  wholesale_approved boolean not null default false,
  login_code text,                                   -- trade-portal login code
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_customers_type on public.customers(type);
do $$ begin
  alter table public.customers add constraint customers_type_chk check (type in ('retail','wholesale'));
exception when duplicate_object then null; end $$;

-- ---------- reviews ----------
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references public.products(id) on delete cascade,
  author_name text,
  rating int check (rating between 1 and 5),
  body text,
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_product on public.reviews(product_id);

-- ---------- abandoned carts ----------
create table if not exists public.abandoned_carts (
  id uuid primary key default uuid_generate_v4(),
  customer_name text,
  phone text,
  items jsonb not null default '[]'::jsonb,
  total integer not null default 0,                  -- paise
  recovered boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- document settings (invoice numbering + cash book openings) ----------
create table if not exists public.doc_settings (
  id int primary key default 1,
  invoice_prefix text not null default 'AJ',
  next_invoice_no integer not null default 1,
  fy text,                                           -- e.g. '26-27' (Indian financial year)
  opening_cash bigint not null default 0,            -- paise
  opening_bank bigint not null default 0             -- paise
);
insert into public.doc_settings (id) values (1) on conflict (id) do nothing;

-- ---------- supplier payments (purchase-side cash book) ----------
create table if not exists public.supplier_payments (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  amount bigint not null,                            -- paise
  mode text,                                         -- cash | upi | bank
  ref text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);

-- ---------- orders: billing columns the app expects ----------
alter table public.orders add column if not exists invoice_no text;
alter table public.orders add column if not exists bill_type text not null default 'cash';       -- 'cash' | 'gst'
alter table public.orders add column if not exists doc_type text not null default 'invoice';     -- 'invoice' | 'proforma'
alter table public.orders add column if not exists amount_paid bigint not null default 0;        -- paise
alter table public.orders add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists source_tag text;
create unique index if not exists uq_orders_invoice_no on public.orders(invoice_no) where invoice_no is not null;
create index if not exists idx_orders_customer on public.orders(customer_id);

-- ---------- estimates: customer phone + link to the billed order ----------
alter table public.estimates add column if not exists customer_phone text;
alter table public.estimates add column if not exists order_id uuid references public.orders(id) on delete set null;

-- ---------- RLS (service-role only; the app never uses the anon key for these) ----------
alter table public.customers enable row level security;
alter table public.reviews enable row level security;
alter table public.abandoned_carts enable row level security;
alter table public.doc_settings enable row level security;
alter table public.supplier_payments enable row level security;


-- ------------------------------------------------------------ 0041_aggarwal_engine_functions.sql
-- ============================================================
-- PART 10 — Aggarwal billing engine: all database functions
-- Authored from the app's contracts. Run LAST (after Parts 1-9).
-- All money is integer paise. All functions are idempotent
-- (CREATE OR REPLACE) — safe to re-run.
-- ============================================================

-- ---------- Indian financial year, e.g. '26-27' ----------
create or replace function public.current_indian_fy(p_at timestamptz default now())
returns text language sql stable as $$
  select case
    when extract(month from p_at at time zone 'Asia/Kolkata') >= 4
      then to_char(p_at at time zone 'Asia/Kolkata', 'YY') || '-' ||
           to_char((p_at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((p_at at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
         to_char(p_at at time zone 'Asia/Kolkata', 'YY')
  end;
$$;

-- ---------- Tier price for a product row (overrides win, else bd_price formula) ----------
create or replace function public.aj_tier_price(p_product public.products, p_tier text)
returns integer language plpgsql stable as $$
begin
  if p_tier = 'wholesale' then
    return coalesce(p_product.wholesale_override, public.bd_price(p_product.base_wholesale, 'wholesale'));
  elsif p_tier = 'mrp' then
    return coalesce(p_product.mrp_override, public.bd_price(p_product.base_wholesale, 'mrp'));
  else
    return coalesce(p_product.retail_override, public.bd_price(p_product.base_wholesale, 'retail'));
  end if;
end; $$;

-- ---------- Sequential GST-style invoice number: AJ/26-27/0001 ----------
create or replace function public.assign_invoice_no(p_order uuid)
returns text language plpgsql as $$
declare ds record; v_fy text; v_no text; v_existing text;
begin
  select invoice_no into v_existing from public.orders where id = p_order;
  if v_existing is not null then return v_existing; end if;
  v_fy := public.current_indian_fy(now());
  select * into ds from public.doc_settings where id = 1 for update;
  if ds is null then
    insert into public.doc_settings(id) values (1) returning * into ds;
  end if;
  if ds.fy is distinct from v_fy then
    update public.doc_settings set fy = v_fy, next_invoice_no = 1 where id = 1;
    ds.next_invoice_no := 1;
  end if;
  v_no := coalesce(ds.invoice_prefix,'AJ') || '/' || v_fy || '/' || lpad(ds.next_invoice_no::text, 4, '0');
  update public.doc_settings set next_invoice_no = ds.next_invoice_no + 1 where id = 1;
  update public.orders set invoice_no = v_no where id = p_order;
  return v_no;
end; $$;

-- ---------- Find-or-create a customer from {name, phone} ----------
create or replace function public.aj_upsert_customer(p_customer jsonb)
returns uuid language plpgsql as $$
declare v_id uuid; v_name text; v_phone text;
begin
  v_name  := nullif(trim(coalesce(p_customer->>'name','')), '');
  v_phone := nullif(trim(coalesce(p_customer->>'phone','')), '');
  if v_name is null and v_phone is null then return null; end if;
  if v_phone is not null then
    select id into v_id from public.customers where phone = v_phone limit 1;
  end if;
  if v_id is null and v_name is not null then
    select id into v_id from public.customers where lower(name) = lower(v_name) limit 1;
  end if;
  if v_id is null then
    insert into public.customers(name, phone) values (v_name, v_phone) returning id into v_id;
  end if;
  return v_id;
end; $$;

-- ---------- place_order: the counter/online sale ----------
create or replace function public.place_order(
  p_items jsonb,
  p_customer jsonb default '{}'::jsonb,
  p_channel text default 'pos',
  p_payment text default 'cash',
  p_allow_oversell boolean default false,
  p_tier text default 'retail'
) returns jsonb language plpgsql as $$
declare
  it jsonb; prod public.products; var public.variants;
  v_order uuid; v_customer uuid; v_qty int; v_price int; v_mrp int; v_total bigint := 0;
  v_color text; v_avail int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to bill';
  end if;
  v_customer := public.aj_upsert_customer(p_customer);

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone, amount_paid)
  values (p_channel::order_channel, 'completed', 0, p_payment, v_customer,
          nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then
      raise exception 'Product % not found', it->>'sku';
    end if;

    var := null;
    v_color := nullif(trim(coalesce(it->>'color','')), '');
    if v_color is not null then
      select * into var from public.variants
      where product_id = prod.id and lower(color) = lower(v_color) limit 1;
    end if;

    v_avail := coalesce(var.qty, prod.qty);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed', prod.sku, v_avail, v_qty;
    end if;

    v_price := public.aj_tier_price(prod, p_tier);
    if var.id is not null then
      v_price := case p_tier
        when 'wholesale' then coalesce(var.wholesale_override, v_price)
        else coalesce(var.retail_override, v_price) end;
    end if;
    v_mrp := public.aj_tier_price(prod, 'mrp');

    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, var.id, v_qty, v_price, v_price * v_qty, v_mrp);
    v_total := v_total + (v_price::bigint * v_qty);

    if var.id is not null then
      update public.variants set qty = greatest(0, qty - v_qty) where id = var.id;
      update public.products
        set qty = greatest(0, coalesce((select sum(qty) from public.variants where product_id = prod.id), 0)),
            last_movement_at = now()
        where id = prod.id;
    else
      update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    end if;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, source, kind)
    values (prod.id, var.id, prod.sku, -v_qty, 'order ' || v_order, 'sale');
  end loop;

  update public.orders
    set total = v_total,
        amount_paid = case when p_payment in ('cash','upi','online','bank') then v_total else 0 end,
        pay_cash = case when p_payment = 'cash' then v_total else 0 end,
        pay_bank = case when p_payment in ('upi','online','bank') then v_total else 0 end
    where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ('sales', v_order, v_total, 'order ' || v_order);

  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- ---------- place_wholesale_order: trade-portal order by an approved party ----------
create or replace function public.place_wholesale_order(
  p_customer uuid,
  p_items jsonb,
  p_allow_oversell boolean default false
) returns jsonb language plpgsql as $$
declare
  cust public.customers; it jsonb; prod public.products;
  v_order uuid; v_qty int; v_price int; v_total bigint := 0; v_min bigint;
begin
  select * into cust from public.customers where id = p_customer;
  if cust is null or not (cust.type = 'wholesale' or cust.wholesale_approved) then
    raise exception 'Not an approved wholesale party';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in the order';
  end if;

  -- pre-validate stock + compute total
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    if not p_allow_oversell and prod.qty < v_qty then
      raise exception 'Not enough stock for % — % available, % ordered', prod.sku, prod.qty, v_qty;
    end if;
    v_total := v_total + (public.aj_tier_price(prod, 'wholesale')::bigint * v_qty);
  end loop;

  select coalesce(wholesale_min_order, 300000) into v_min from public.pricing_settings limit 1;
  if v_total < coalesce(v_min, 300000) then
    raise exception 'Minimum wholesale order is Rs %', (coalesce(v_min,300000) / 100);
  end if;

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone)
  values ('wholesale', 'pending', 0, 'credit', cust.id, cust.name, cust.phone)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    v_price := public.aj_tier_price(prod, 'wholesale');
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, v_qty, v_price, v_price * v_qty, public.aj_tier_price(prod, 'mrp'));
    update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    insert into public.stock_adjustments(product_id, sku, delta, source, kind)
    values (prod.id, prod.sku, -v_qty, 'wholesale order ' || v_order, 'sale');
  end loop;

  update public.orders set total = v_total where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'wholesale order ' || v_order);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- ---------- create_estimate: quote at retail prices, NO stock movement ----------
create or replace function public.create_estimate(p_items jsonb, p_customer jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; prod public.products; v_est uuid; v_qty int; v_price int; v_total bigint := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items on the estimate';
  end if;
  insert into public.estimates(customer_name, customer_phone, total, status)
  values (nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0, 'open')
  returning id into v_est;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    v_price := public.aj_tier_price(prod, 'retail');
    insert into public.estimate_items(estimate_id, product_id, qty, unit_price, line_total)
    values (v_est, prod.id, v_qty, v_price, v_price * v_qty);
    v_total := v_total + (v_price::bigint * v_qty);
  end loop;
  update public.estimates set total = v_total where id = v_est;
  return jsonb_build_object('estimate_id', v_est, 'total', v_total);
end; $$;

-- ---------- convert_estimate_v2: bill an estimate (atomic, stock-guarded) ----------
create or replace function public.convert_estimate_v2(
  p_estimate_id uuid,
  p_bill_type text default 'cash',
  p_allow_oversell boolean default false
) returns jsonb language plpgsql as $$
declare
  est public.estimates; li record; prod public.products;
  v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  -- pre-validate every line before touching stock
  for li in select ei.*, p.sku as p_sku, p.qty as p_qty
            from public.estimate_items ei join public.products p on p.id = ei.product_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell and li.p_qty < li.qty then
      raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
    end if;
  end loop;

  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, 'cash', coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
    insert into public.stock_adjustments(product_id, delta, source, kind)
    values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- legacy single-arg form used by convertEstimateAction
create or replace function public.convert_estimate(p_estimate_id uuid)
returns jsonb language plpgsql as $$
begin
  return public.convert_estimate_v2(p_estimate_id, 'cash', false);
end; $$;

-- ---------- record_purchase: goods-in, per line, variant-aware ----------
create or replace function public.record_purchase(p_supplier_id uuid, p_bill_no text, p_items jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; v_purchase uuid; v_total bigint := 0; v_qty int; v_cost int;
        v_pid uuid; v_vid uuid; v_sku text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No purchase lines';
  end if;
  insert into public.purchases(supplier_id, bill_no, total) values (p_supplier_id, p_bill_no, 0)
  returning id into v_purchase;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := greatest(1, coalesce((it->>'qty')::int, 1));
    v_cost := greatest(0, coalesce((it->>'unit_cost')::int, 0));
    v_pid  := nullif(it->>'mapped_product_id','')::uuid;
    v_vid  := nullif(it->>'variant_id','')::uuid;
    v_sku  := nullif(trim(coalesce(it->>'supplier_sku','')), '');

    insert into public.purchase_items(purchase_id, supplier_sku, mapped_product_id, variant_id, qty, unit_cost)
    values (v_purchase, v_sku, v_pid, v_vid, v_qty, v_cost);
    v_total := v_total + (v_cost::bigint * v_qty);

    if v_vid is not null then
      update public.variants set qty = qty + v_qty where id = v_vid;
      update public.products p
        set qty = greatest(0, coalesce((select sum(qty) from public.variants v where v.product_id = p.id), 0)),
            last_movement_at = now()
        where id = (select product_id from public.variants where id = v_vid);
    elsif v_pid is not null then
      update public.products set qty = qty + v_qty, last_movement_at = now() where id = v_pid;
    end if;
    if v_pid is not null or v_vid is not null then
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (coalesce(v_pid, (select product_id from public.variants where id = v_vid)), v_vid, v_qty, 'purchase ' || v_purchase, 'purchase');
    end if;
  end loop;

  update public.purchases set total = v_total where id = v_purchase;
  insert into public.ledger(kind, ref_id, debit, note) values ('purchase', v_purchase, v_total, 'purchase bill ' || coalesce(p_bill_no,''));
  return jsonb_build_object('purchase_id', v_purchase, 'total', v_total);
end; $$;

-- ---------- delete_purchase: reverse the stock, then remove the bill ----------
create or replace function public.delete_purchase(p_id uuid)
returns void language plpgsql as $$
declare li record;
begin
  for li in select * from public.purchase_items where purchase_id = p_id loop
    if li.variant_id is not null then
      update public.variants set qty = greatest(0, qty - li.qty) where id = li.variant_id;
      update public.products p
        set qty = greatest(0, coalesce((select sum(qty) from public.variants v where v.product_id = p.id), 0))
        where id = (select product_id from public.variants where id = li.variant_id);
    elsif li.mapped_product_id is not null then
      update public.products set qty = greatest(0, qty - li.qty) where id = li.mapped_product_id;
    end if;
    if li.mapped_product_id is not null or li.variant_id is not null then
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (coalesce(li.mapped_product_id, (select product_id from public.variants where id = li.variant_id)), li.variant_id, -li.qty, 'purchase ' || p_id || ' deleted', 'correction');
    end if;
  end loop;
  delete from public.purchase_items where purchase_id = p_id;
  delete from public.purchases where id = p_id;
end; $$;

-- ---------- record_payment: receive money against a bill ----------
create or replace function public.record_payment(p_order uuid, p_amount bigint, p_mode text default 'cash')
returns void language plpgsql as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be positive'; end if;
  update public.orders
    set amount_paid = coalesce(amount_paid,0) + p_amount,
        pay_cash = coalesce(pay_cash,0) + case when p_mode = 'cash' then p_amount else 0 end,
        pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then p_amount else 0 end
    where id = p_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values (case when p_mode = 'cash' then 'cash' else 'bank' end, p_order, p_amount, 'payment ' || p_mode);
end; $$;

-- ---------- cash_bank_summary: cash book headline numbers ----------
create or replace function public.cash_bank_summary()
returns table(opening_cash bigint, opening_bank bigint, cash_in bigint, bank_in bigint, cash_out bigint, bank_out bigint)
language sql stable as $$
  select
    (select coalesce(opening_cash,0) from public.doc_settings where id = 1),
    (select coalesce(opening_bank,0) from public.doc_settings where id = 1),
    (select coalesce(sum(pay_cash),0) from public.orders),
    (select coalesce(sum(pay_bank),0) from public.orders),
    (select coalesce(sum(amount),0) from public.supplier_payments where mode = 'cash'),
    (select coalesce(sum(amount),0) from public.supplier_payments where coalesce(mode,'bank') <> 'cash');
$$;


-- ------------------------------------------------------------ 0042_diva_memory.sql
-- Aggarwal Jewellers — 0042: DIVA business memory (AI employee upgrade).
-- Rules the owner tells DIVA to remember ("remember: hide dead products after 90 days").
-- Read into the planner prompt on every low-confidence command; written by remember_note.

create table if not exists public.diva_memory (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.diva_memory enable row level security;


-- ------------------------------------------------------------ 0043_party_ledger.sql
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


-- ------------------------------------------------------------ 0044_language_pref.sql
-- Aggarwal Jewellers — 0044: Console language preference (English / Hindi).
-- ADDITIVE + IDEMPOTENT. Per-role language (staff sign in with a role passcode, so the
-- role IS the user) + the owner's own preference on doc_settings. The app copies the
-- preference into the `bd_lang` cookie at login; the sidebar toggle updates both.

alter table public.roles add column if not exists lang text not null default 'en';
do $$ begin
  alter table public.roles add constraint roles_lang_chk check (lang in ('en','hi'));
exception when duplicate_object then null; end $$;

alter table public.doc_settings add column if not exists owner_lang text not null default 'en';
do $$ begin
  alter table public.doc_settings add constraint doc_settings_owner_lang_chk check (owner_lang in ('en','hi'));
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 0045_receivables_integrity.sql
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


-- ------------------------------------------------------------ 0046_integrity_pack.sql
-- Aggarwal Jewellers — 0046: Integrity pack (features studied from the reference build,
-- implemented NATIVELY on Aggarwal's engine — order_grand_paise/return_amount from 0045
-- stay the single source of truth; nothing was copied).
-- ADDITIVE + IDEMPOTENT. Contents:
--   1) Per-line return caps  — order_items.returned_qty (+backfill); a line's return window
--      closes when sold − returned is exhausted (no double returns).
--   2) record_sales_return v3 — cap-aware, VARIANT-CORRECT line pricing (the old body priced
--      every return off the first matching product line), keeps 0045's orders.return_amount.
--   3) cancel_order — restock net-of-returns, day-book reversal, tender refund reversal,
--      status='cancelled'; idempotent; feeds every downstream (Udhaar, cashbook, dashboard
--      already exclude dead statuses per 0045).
--   4) Purchase returns — record_purchase_return RPC (per-line caps, stock-availability guard,
--      debit note on purchases.return_amount) + payables everywhere become net of returns.
--   5) Variant qty = source of truth — trigger keeps product.qty ≡ Σ variants + one-time heal.

-- 1) Per-line sales-return caps ---------------------------------------------------------------
alter table public.order_items add column if not exists returned_qty int not null default 0;

update public.order_items oi
set returned_qty = least(oi.qty, agg.rqty)
from (
  select sa.ref_id as order_id, sa.product_id, sa.variant_id, sum(sa.delta)::int as rqty
  from public.stock_adjustments sa
  where sa.kind = 'return' and sa.delta > 0 and sa.ref_id is not null
  group by sa.ref_id, sa.product_id, sa.variant_id
) agg
where oi.order_id = agg.order_id and oi.product_id = agg.product_id
  and oi.variant_id is not distinct from agg.variant_id
  and coalesce(oi.returned_qty, 0) = 0;

-- 2) record_sales_return v3 -------------------------------------------------------------------
create or replace function public.record_sales_return(p_order_id uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer as $function$
declare v_id uuid := uuid_generate_v4(); it jsonb; v_qty int := 0; v_amt bigint := 0; v_bal int;
        v_prod uuid; v_variant uuid; v_iqty int; v_apply int; v_sku text; v_vid uuid;
        oi record; o record; v_found boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','void','refunded') then raise exception 'Bill is cancelled — nothing to return.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := (it->>'product_id')::uuid;
    v_variant := nullif(it->>'variant_id','')::uuid;
    v_iqty := coalesce((it->>'qty')::int, 0);
    if v_iqty <= 0 then continue; end if;

    -- The exact bill line (product + variant); legacy calls without a variant fall back to
    -- the product's line with the most remaining window.
    select * into oi from public.order_items
      where order_id = p_order_id and product_id = v_prod and variant_id is not distinct from v_variant
      limit 1 for update;
    v_found := found;
    if not v_found then
      select * into oi from public.order_items
        where order_id = p_order_id and product_id = v_prod
        order by (qty - coalesce(returned_qty,0)) desc limit 1 for update;
      v_found := found;
    end if;
    if not v_found then continue; end if;

    v_apply := least(v_iqty, greatest(0, oi.qty - coalesce(oi.returned_qty, 0)));   -- CAP
    if v_apply <= 0 then continue; end if;
    update public.order_items set returned_qty = coalesce(returned_qty,0) + v_apply where id = oi.id;

    v_vid := coalesce(v_variant, oi.variant_id);
    if v_vid is not null then
      update public.variants set qty = qty + v_apply where id = v_vid;
      update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = v_prod), last_movement_at = now() where id = v_prod;
      select upper(sku) into v_sku from public.variants where id = v_vid;
    else
      update public.products set qty = qty + v_apply, last_movement_at = now() where id = v_prod;
      select upper(sku) into v_sku from public.products where id = v_prod;
    end if;

    v_qty := v_qty + v_apply;
    v_amt := v_amt + coalesce(oi.unit_price, 0)::bigint * v_apply;  -- THAT line's billed rate
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id, created_at)
      values (v_prod, v_vid, v_sku, v_apply, 'return', 'Sales return', coalesce(nullif(p_reason,''),'Returned'), p_order_id, now());
  end loop;

  if v_qty = 0 then raise exception 'Nothing returnable — these lines are already fully returned.'; end if;

  insert into public.returns(id, kind, ref_order_id, reason, qty, created_at) values (v_id, 'sales', p_order_id, p_reason, v_qty, now());
  select coalesce(max(balance),0) into v_bal from public.ledger;
  insert into public.ledger(kind, ref_id, debit, credit, balance, note, created_at)
    values ('sales', v_id, v_amt, 0, v_bal - v_amt, concat('Sales return: ', p_reason), now());
  -- 0045 mechanism: the returned value reduces this bill's receivable everywhere.
  update public.orders set return_amount = coalesce(return_amount,0) + v_amt where id = p_order_id;
  insert into public.audit_log(actor, action, ref, detail)
    values ('staff','sales_return', v_id::text, coalesce(p_reason,'') || ' · ' || v_qty || ' pcs · ' || v_amt || 'p');
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $function$;

-- 3) cancel_order -------------------------------------------------------------------------------
create or replace function public.cancel_order(p_order uuid, p_reason text default 'Cancelled')
returns jsonb language plpgsql security definer as $$
declare o record; it record; v_restock int; v_restocked int := 0; v_refund bigint := 0;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','void','refunded') then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;

  -- Restock every line NET of pieces already returned (those are back in stock already).
  for it in
    select oi.*, upper(p.sku) as psku from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order
  loop
    v_restock := greatest(0, it.qty - coalesce(it.returned_qty, 0));
    if v_restock > 0 then
      if it.variant_id is not null then
        update public.variants set qty = qty + v_restock where id = it.variant_id;
        update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = it.product_id), last_movement_at = now() where id = it.product_id;
      else
        update public.products set qty = qty + v_restock, last_movement_at = now() where id = it.product_id;
      end if;
      insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
        values (it.product_id, it.variant_id, it.psku, v_restock, 'cancel', 'order ' || p_order || ' cancelled', coalesce(nullif(p_reason,''),'Cancelled'), p_order);
      v_restocked := v_restocked + v_restock;
    end if;
  end loop;

  -- Day-book: reverse the sale value that hasn't already been reversed by return credits.
  insert into public.ledger(kind, ref_id, debit, note)
    values ('sales', p_order, greatest(0, coalesce(o.total,0) - coalesce(o.return_amount,0)), 'Order cancelled: ' || coalesce(nullif(p_reason,''),'-'));
  -- Money back: reverse the recorded tender so cash-in-hand / bank books stay true.
  if coalesce(o.pay_cash,0) > 0 then
    insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, o.pay_cash, 'Refund on cancel');
  end if;
  if coalesce(o.pay_bank,0) > 0 then
    insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, o.pay_bank, 'Refund on cancel');
  end if;
  v_refund := coalesce(o.pay_cash,0) + coalesce(o.pay_bank,0);

  update public.orders
    set status = 'cancelled', amount_paid = 0, pay_cash = 0, pay_bank = 0,
        admin_note = trim(coalesce(admin_note,'') || ' [Cancelled: ' || coalesce(nullif(p_reason,''),'-') || ']')
    where id = p_order;

  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'order_cancelled', p_order::text,
            coalesce(p_reason,'Cancelled') || ' · restocked ' || v_restocked || ' pcs · refund reversed ' || v_refund || 'p');
  return jsonb_build_object('ok', true, 'restocked', v_restocked, 'refund', v_refund);
end; $$;

-- 4) Purchase returns ---------------------------------------------------------------------------
alter table public.purchases add column if not exists return_amount bigint not null default 0;
alter table public.purchase_items add column if not exists returned_qty int not null default 0;

create or replace function public.record_purchase_return(p_purchase uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer as $$
declare v_id uuid := uuid_generate_v4(); it jsonb; v_qty int := 0; v_amt bigint := 0;
        li record; v_apply int; v_stock int; v_sku text;
begin
  perform 1 from public.purchases where id = p_purchase for update;
  if not found then raise exception 'Purchase not found'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into li from public.purchase_items
      where id = (it->>'purchase_item_id')::uuid and purchase_id = p_purchase for update;
    if not found then continue; end if;
    v_apply := least(coalesce((it->>'qty')::int, 0), greatest(0, li.qty - coalesce(li.returned_qty, 0)));  -- CAP
    if v_apply <= 0 then continue; end if;
    if li.mapped_product_id is null then raise exception 'Line is not mapped to a product — map it before returning.'; end if;

    -- The pieces must physically be in stock to hand back to the supplier.
    if li.variant_id is not null then
      select qty, upper(sku) into v_stock, v_sku from public.variants where id = li.variant_id;
    else
      select qty, upper(sku) into v_stock, v_sku from public.products where id = li.mapped_product_id;
    end if;
    if coalesce(v_stock, 0) < v_apply then
      raise exception 'Only % in stock for % — cannot return % to the supplier.', coalesce(v_stock,0), v_sku, v_apply;
    end if;

    if li.variant_id is not null then
      update public.variants set qty = qty - v_apply where id = li.variant_id;
      update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = li.mapped_product_id), last_movement_at = now() where id = li.mapped_product_id;
    else
      update public.products set qty = qty - v_apply, last_movement_at = now() where id = li.mapped_product_id;
    end if;
    update public.purchase_items set returned_qty = coalesce(returned_qty,0) + v_apply where id = li.id;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
      values (li.mapped_product_id, li.variant_id, v_sku, -v_apply, 'purchase_return', 'Purchase return ' || p_purchase, coalesce(nullif(p_reason,''),'Returned to supplier'), p_purchase);
    v_qty := v_qty + v_apply;
    v_amt := v_amt + coalesce(li.unit_cost, 0)::bigint * v_apply;
  end loop;

  if v_qty = 0 then raise exception 'Nothing returnable on this bill (lines already fully returned).'; end if;

  insert into public.returns(id, kind, ref_purchase_id, reason, qty) values (v_id, 'purchase', p_purchase, p_reason, v_qty);
  update public.purchases set return_amount = coalesce(return_amount,0) + v_amt where id = p_purchase;   -- debit note
  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'purchase_return', v_id::text, coalesce(p_reason,'') || ' · ' || v_qty || ' pcs · debit note ' || v_amt || 'p');
  return jsonb_build_object('return_id', v_id, 'qty', v_qty, 'amount', v_amt);
end; $$;

-- Payables become NET of purchase-return debit notes.
create or replace view public.v_accounting_health as
select
  (select count(*) from v_inventory_reconciliation) as inventory_drift_products,
  (select count(*) from v_overpaid_orders) as overpaid_orders,
  (select count(*) from products where coalesce(qty,0) < 0) as negative_stock,
  (select count(*) from stock_adjustments where ref_id is null and kind in ('sale','purchase','return','estimate')) as movements_without_source,
  (select coalesce(sum(greatest(0, public.order_grand_paise(total, bill_type, gst_mode, coalesce(return_amount,0))
                                   - coalesce(amount_paid,0))),0)
     from orders where status not in ('cancelled','void','refunded')) as receivable_paise,
  (select coalesce(sum(p.total - coalesce(p.return_amount,0)),0)
          - coalesce((select sum(amount) from supplier_payments),0) from purchases p) as payable_paise;

-- 5) Variant quantities are the source of truth --------------------------------------------------
create or replace function public.sync_product_qty_from_variants() returns trigger
language plpgsql as $$
declare v_pid uuid := coalesce(new.product_id, old.product_id); v_sum int;
begin
  if v_pid is not null then
    select coalesce(sum(qty), 0) into v_sum from public.variants where product_id = v_pid;
    if found and exists (select 1 from public.variants where product_id = v_pid) then
      update public.products set qty = v_sum where id = v_pid and qty is distinct from v_sum;
    end if;
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_sync_product_qty on public.variants;
create trigger trg_sync_product_qty
after insert or delete or update of qty on public.variants
for each row execute function public.sync_product_qty_from_variants();

-- One-time heal: align every varianted product's total to Σ its variants.
update public.products p set qty = v.sum_qty
from (select product_id, coalesce(sum(qty),0) as sum_qty from public.variants group by product_id) v
where p.id = v.product_id and p.qty <> v.sum_qty;


-- ------------------------------------------------------------ 0047_orders_fulfillment.sql
-- Aggarwal Jewellers — 0047: Website-order fulfillment (feature studied from the reference
-- build; implemented natively). ADDITIVE + IDEMPOTENT.
-- New website orders (retail + wholesale channels) land in an accept/reject queue at
-- /admin/orders; accepted orders move dispatch → deliver with timestamps that power the
-- public order-tracking timeline (/track). Rejection uses cancel_order (0046) so stock,
-- day-book, revenue, Udhaar and the cash book all stay consistent.

alter table public.orders add column if not exists fulfillment text;
do $$ begin
  alter table public.orders add constraint orders_fulfillment_chk
    check (fulfillment is null or fulfillment in ('accepted','rejected'));
exception when duplicate_object then null; end $$;

alter table public.orders add column if not exists dispatched_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;

create index if not exists idx_orders_web_new
  on public.orders(created_at desc)
  where fulfillment is null;

-- Backfill: everything that already happened is treated as accepted, so the new queue
-- starts empty instead of flooding with history.
update public.orders set fulfillment = 'accepted' where channel <> 'pos' and fulfillment is null;


-- ------------------------------------------------------------ 0048_wholesale_growth.sql
-- Aggarwal Jewellers — 0048: Wholesale growth pack (features studied from the reference
-- build, implemented natively on Aggarwal's engine). ADDITIVE + IDEMPOTENT.
--   1) Vouchers / coupon engine — % or flat, min-order, cap, channel, schedule, usage limit.
--      Validation + redemption are SERVER-ONLY; the discount is re-derived at order time and
--      posted to the day-book, so orders.total (and therefore GST, receivables, dashboards)
--      stays the single source of truth.
--   2) Wholesale quantity-break tiers — [{"min_qty":12,"pct_off":5},…] on pricing_settings;
--      applied per line at order time (unit_mrp keeps the pre-discount rate so the invoice's
--      existing Rate → Disc → Amount rendering shows it transparently).
--   3) Quote requests (RFQ) — trade portal → owner inbox.
--   4) Dealer self-signup — application with business proof lands as a PENDING wholesale
--      customer (the existing approve flow on the customer page grants access).
--   5) Retail shipping is now BOOKED on the order (extra_courier) — fixes a pre-existing gap
--      where the customer paid ₹50 shipping that never entered the books.

-- 1) Vouchers ----------------------------------------------------------------------------------
create table if not exists public.vouchers (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  kind text not null default 'percent',          -- 'percent' | 'flat'
  value integer not null,                        -- percent (1-90) or paise
  min_order bigint not null default 0,           -- paise
  cap bigint,                                    -- max discount in paise (percent kind)
  channel text not null default 'retail',       -- 'retail' | 'wholesale' | 'all'
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,                           -- null = unlimited
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.vouchers add constraint vouchers_kind_chk check (kind in ('percent','flat'));
  alter table public.vouchers add constraint vouchers_channel_chk check (channel in ('retail','wholesale','all'));
exception when duplicate_object then null; end $$;
alter table public.vouchers enable row level security;

alter table public.orders add column if not exists voucher_code text;
alter table public.orders add column if not exists voucher_discount bigint not null default 0;  -- paise
alter table public.orders add column if not exists tier_discount bigint not null default 0;     -- paise
alter table public.checkout_intents add column if not exists voucher_code text;

-- Atomic redemption: only succeeds while under the usage limit (row-locked).
create or replace function public.redeem_voucher(p_code text)
returns boolean language plpgsql security definer as $$
declare v record;
begin
  select * into v from public.vouchers where upper(code) = upper(p_code) for update;
  if not found or not v.active then return false; end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then return false; end if;
  update public.vouchers set used_count = used_count + 1 where id = v.id;
  return true;
end; $$;

-- 2) Wholesale quantity-break tiers --------------------------------------------------------------
alter table public.pricing_settings add column if not exists wholesale_tiers jsonb not null default '[]'::jsonb;

-- 3) Quote requests (RFQ) ------------------------------------------------------------------------
create table if not exists public.quote_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete set null,
  name text,
  phone text,
  items text not null,                            -- free-text lines: what + how many
  note text,
  status text not null default 'new',             -- 'new' | 'quoted' | 'closed'
  quote_note text,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.quote_requests add constraint quote_requests_status_chk check (status in ('new','quoted','closed'));
exception when duplicate_object then null; end $$;
alter table public.quote_requests enable row level security;

-- 4) Dealer self-signup --------------------------------------------------------------------------
alter table public.customers add column if not exists business_proof_url text;
alter table public.customers add column if not exists signup_note text;


-- ------------------------------------------------------------ 0049_marketing_backoffice.sql
-- Aggarwal Jewellers — 0049: Marketing + back-office pack (features studied from the
-- reference build, implemented natively). ADDITIVE + IDEMPOTENT.
--   1) Promotions v2 — placement (hero | strip | popup), scheduling window, headline and an
--      optional voucher code hook; the storefront strip/popup render only inside the window.
--   2) Real abandoned-cart tracking — carts upsert by a stable browser key while the customer
--      shops; the Abandoned page shows only carts idle 30+ minutes that never converted,
--      and a completed checkout marks its cart recovered.

-- 1) Promotions v2 -------------------------------------------------------------------------------
alter table public.promotions add column if not exists placement text not null default 'hero';
do $$ begin
  alter table public.promotions add constraint promotions_placement_chk check (placement in ('hero','strip','popup'));
exception when duplicate_object then null; end $$;
alter table public.promotions add column if not exists starts_at timestamptz;
alter table public.promotions add column if not exists ends_at timestamptz;
alter table public.promotions add column if not exists headline text;
alter table public.promotions add column if not exists coupon_code text;

-- 2) Abandoned carts v2 --------------------------------------------------------------------------
alter table public.abandoned_carts add column if not exists cart_key text;
alter table public.abandoned_carts add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_abandoned_cart_key on public.abandoned_carts(cart_key) where cart_key is not null;


-- ------------------------------------------------------------ 0050_units_and_codes.sql
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


-- ------------------------------------------------------------ 0051_refunds.sql
-- Aggarwal Jewellers — 0051: Cash/bank refunds (closes the audit's top remaining risk).
-- ADDITIVE + IDEMPOTENT.
-- After a return or an over-collection, a bill can hold MORE money than its grand total
-- (they surface on v_overpaid_orders as "refund due"), but handing the money back had no
-- recording — cash-in-hand stayed overstated. record_refund reverses the tender correctly:
-- amount_paid and the pay_cash/pay_bank buckets come down, a day-book debit is posted, and
-- every downstream figure (cash book, Udhaar via order_grand_paise, dashboard) self-corrects.
create or replace function public.record_refund(p_order uuid, p_amount bigint, p_mode text default 'cash')
returns void language plpgsql security definer as $$
declare o record; v_over bigint; v_amt bigint; v_cash bigint; v_bank bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Refund must be positive'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  -- Refundable = what was collected beyond the grand total (net of returns). Clamped so a
  -- refund can never push the bill back into "due" by mistake.
  v_over := greatest(0, coalesce(o.amount_paid,0)
                        - public.order_grand_paise(o.total, o.bill_type, o.gst_mode, coalesce(o.return_amount,0)));
  v_amt := least(p_amount, v_over);
  if v_amt <= 0 then raise exception 'Nothing refundable on this bill — it holds no excess money.'; end if;

  -- Reverse the tender bucket the money goes back through (fall over to the other bucket
  -- if the chosen one doesn't hold enough — e.g. paid by UPI, refunded in cash).
  if p_mode = 'cash' then
    v_cash := least(v_amt, coalesce(o.pay_cash,0)); v_bank := v_amt - v_cash;
  else
    v_bank := least(v_amt, coalesce(o.pay_bank,0)); v_cash := v_amt - v_bank;
  end if;
  update public.orders
    set amount_paid = greatest(0, coalesce(amount_paid,0) - v_amt),
        pay_cash = greatest(0, coalesce(pay_cash,0) - v_cash),
        pay_bank = greatest(0, coalesce(pay_bank,0) - v_bank)
    where id = p_order;
  if v_cash > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, v_cash, 'Refund to customer'); end if;
  if v_bank > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, v_bank, 'Refund to customer'); end if;
  insert into public.audit_log(actor, action, ref, detail)
  values ('staff', 'refund', p_order::text, 'Refunded ' || v_amt || 'p (' || coalesce(p_mode,'cash') || ')');
end; $$;


-- ------------------------------------------------------------ 0052_customers_address.sql
-- Aggarwal Jewellers — 0052: customers.address (QA fix).
-- The checkout & POS flows have always tried to store the customer's address, and the
-- Website Orders queue joins it for the delivery card — but the column never existed in
-- this schema, silently failing customer inserts and 400-ing the orders-queue query.
alter table public.customers add column if not exists address text;


-- ------------------------------------------------------------ 0053_ledger_kind_cast.sql
-- Aggarwal Jewellers — 0053: fix "column kind is of type ledger_kind but expression is of type text".
-- QA (16 Jul) caught that NO payment could be recorded: record_payment and record_party_payment
-- insert into ledger with `case when p_mode='cash' then 'cash' else 'bank' end`, and a CASE of two
-- string literals resolves to TEXT, which Postgres will not implicitly cast to the ledger_kind enum
-- (bare literals like ('sales', …) coerce fine — only the CASE form breaks). This silently broke:
--   • COD collection on "Mark delivered" (fulfillment)
--   • the invoice "Record a payment" panel (advance / part-payment)
--   • Udhaar party receive on /admin/creditors (oldest-first allocation)
-- Fix: recreate both functions with an explicit ::public.ledger_kind cast. IDEMPOTENT.

-- 1) record_payment — single-bill receipt, clamped to the true GST-aware due (0045 logic kept).
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
  values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
          p_order, v_amt, 'payment ' || coalesce(p_mode,'cash'));
end; $$;

-- 2) record_party_payment — lump receipt from a party, allocated oldest-first (0045 logic kept).
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
      values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
              o.id, v_applied,
              'party payment ' || coalesce(p_mode,'cash') || coalesce(' · ' || o.invoice_no, ''));
    v_allocs := v_allocs || jsonb_build_object('order_id', o.id, 'invoice_no', o.invoice_no, 'applied', v_applied);
    v_left := v_left - v_applied;
  end loop;

  -- Surplus = advance we hold for the party → reduces what they owe (0045 sign).
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


-- ------------------------------------------------------------ 0054_orders_buyer_columns.sql
-- Aggarwal Jewellers — 0054: add the B2B buyer columns the app writes but no migration ever created.
-- QA (16 Jul) found EVERY POS sale's post-billing update failing silently with
--   column "buyer_gstin" of relation "orders" does not exist
-- (the columns existed only in the reference project's DB, added by hand there, never migrated).
-- Because Supabase updates are all-or-nothing, that one bad column silently discarded the WHOLE
-- payload on every counter bill: partial payment (amount_paid), tender split (pay_cash/pay_bank),
-- customer link (customer_id) and salesperson attribution (sales_employee_id) — every POS bill
-- recorded as fully paid to a walk-in with no employee tally. ADDITIVE + IDEMPOTENT.

alter table public.orders add column if not exists buyer_gstin   text;
alter table public.orders add column if not exists buyer_address text;
alter table public.orders add column if not exists buyer_state   text;


-- ------------------------------------------------------------ 0055_bd_price_charm_restore.sql
-- Aggarwal Jewellers — 0055: restore charm rounding in bd_price (fixes the ₹559-shown /
-- ₹550-billed drift — QA bug #4, the root of the price mismatch on every surface).
--
-- History: 0032 synced bd_price to the JS engine (lib/pricing.ts) — RETAIL charm-rounds UP to
-- the next rupee ending in 9, MRP rounds to the nearest rupee ending in 0/5, never below retail.
-- 0036 then rewrote bd_price for the full build-up chain and ACCIDENTALLY DROPPED the charm
-- rounding, so the storefront/POS UI (JS: ₹559 / ₹690) and the billed order (SQL: ₹550 / ₹688)
-- diverged. This restores 0032's rounding on top of 0036's structure — after this, what the
-- customer sees is exactly what place_order / estimates bill. Mirrors lib/pricing.ts
-- roundRetailCharmPaise / roundMrpTo5Paise EXACTLY (verified value-for-value in tests).
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE only; no data change. Values are integer paise.

CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; bump int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    -- %-build-up chain (owner's costing sheet): shipping% → +packing → +promotion →
    -- reseller% → customer% = retail; retail × mrp% = MRP. Wholesale = the entered base.
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers (current default formula).
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 10) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 2.2);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 2.75);
  end if;

  -- RETAIL: charm-round UP to the next whole rupee ending in 9 (paise in / paise out).
  ret_rupees := greatest(1, round(retail_raw / 100.0)::int);
  bump       := ((9 - (ret_rupees % 10)) + 10) % 10;
  retail_out := (ret_rupees + bump) * 100;

  -- MRP: nearest whole rupee ending in 0/5, never printed below the retail selling price.
  mrp_rupees := round(mrp_raw / 100.0 / 5.0)::int * 5;
  if mrp_rupees <= 0 then mrp_rupees := 5; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 5.0)::int * 5) * 100;
  end if;

  return (case p_tier
            when 'wholesale' then wholesale_out
            when 'mrp' then mrp_out
            else retail_out end)::int;
end; $function$;

-- Sanity probes (run manually if you like):
--   select public.bd_price(25000,'retail');    -- expect 55900  (₹559 — matches storefront)
--   select public.bd_price(25000,'mrp');       -- expect 69000  (₹690)
--   select public.bd_price(25000,'wholesale'); -- expect 27500  (₹275)
--   select public.bd_price(15000,'retail');    -- expect 33900  (₹339)
--   select public.bd_price(15000,'mrp');       -- expect 41500  (₹415)


-- ------------------------------------------------------------ 0056_scrub_stale_brand.sql
-- Aggarwal Jewellers — 0056: scrub the old "AggarwalDIVA" brand from STORED AI content.
-- The listing prompt was retuned long ago, but content generated during the deploy blockage
-- (e.g. BD1000's page title "Mahika Necklace | AggarwalDIVA | …" and "by AggarwalDIVA" in the
-- description) is data, not code — this one-time pass rewrites it in place. IDEMPOTENT: the
-- WHERE clause matches nothing once clean; the double-brand dedupe keeps titles tidy.

update public.products
set generated_content = replace(
      regexp_replace(generated_content::text, 'AggarwalDIVA', 'Aggarwal Jewellers', 'gi'),
      'Aggarwal Jewellers | Aggarwal Jewellers', 'Aggarwal Jewellers'
    )::jsonb
where generated_content is not null
  and generated_content::text ilike '%aggarwaldiva%';

-- Same scrub for any cached variant/media captions that may carry the old brand (best-effort;
-- skipped automatically if the table/column doesn't exist in this build).
do $$ begin
  update public.image_generations
  set prompt = regexp_replace(prompt, 'AggarwalDIVA', 'Aggarwal Jewellers', 'gi')
  where prompt ilike '%aggarwaldiva%';
exception when undefined_table or undefined_column then null; end $$;


-- ------------------------------------------------------------ 0057_supplier_columns.sql
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


-- ------------------------------------------------------------ 0058_reward_campaigns.sql
-- Aggarwal Jewellers — 0058: customer reward campaigns.
-- Spend-targeting should only track WITHIN a defined campaign window (start→end) and only while a
-- campaign is live — not against an arbitrary rolling target forever. This table holds each reward
-- campaign; the Promotions page measures every customer's spend between the campaign's dates against
-- its target, so progress resets per campaign and stops when it ends. ADDITIVE + IDEMPOTENT.

create table if not exists public.reward_campaigns (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  target_paise bigint not null,
  reward_note  text,                         -- what they get (e.g. "₹500 off next order")
  scope        text not null default 'all',  -- all | retail | wholesale
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,                  -- null = open-ended until manually ended
  status       text not null default 'active', -- active | ended
  created_at   timestamptz not null default now()
);

do $$ begin
  alter table public.reward_campaigns add constraint reward_campaigns_scope_chk check (scope in ('all','retail','wholesale'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reward_campaigns add constraint reward_campaigns_status_chk check (status in ('active','ended'));
exception when duplicate_object then null; end $$;

create index if not exists idx_reward_campaigns_status on public.reward_campaigns(status);

-- Server-only access (service-role bypasses RLS); lock the anon key out, like other private tables.
alter table public.reward_campaigns enable row level security;


-- ------------------------------------------------------------ 0059_wholesale_qr_payment.sql
-- 0059 — Wholesale QR (UPI) payment gate
-- Dealers on the trade portal pay by scanning the shop's ICICI UPI QR (no Razorpay).
-- The order must NOT enter the accept → dispatch chain until the owner has personally
-- confirmed the money landed. These columns track that hand-off:
--   payment_ref          — the UPI reference / txn id the dealer types in after paying
--   payment_confirmed_at — set when the OWNER clicks "Payment received" (the gate)
--   payment_confirmed_by — which console role confirmed it (audit)
-- All nullable & additive, so existing retail/POS orders are unaffected.

alter table orders add column if not exists payment_ref          text;
alter table orders add column if not exists payment_confirmed_at timestamptz;
alter table orders add column if not exists payment_confirmed_by text;

-- Fast lookup of wholesale orders still waiting on payment confirmation.
create index if not exists orders_awaiting_wholesale_payment
  on orders (created_at)
  where channel = 'wholesale' and payment_confirmed_at is null;


-- ------------------------------------------------------------ 0060_wholesale_defer_commit.sql
-- 0060 — Wholesale: don't touch stock or revenue until the owner confirms UPI payment.
--
-- Before this, place_wholesale_order() decremented stock AND booked a sales-ledger credit the
-- instant a dealer placed an order — so an unpaid order both reduced inventory and inflated
-- revenue. With the QR pay-first flow (0059) that's wrong: nothing should be committed until the
-- owner confirms the money landed.
--
-- New shape:
--   place_wholesale_order  → creates the order (status 'pending') + items + total ONLY.
--                            Pre-validates stock (so an unfulfillable order can't be placed) but
--                            does NOT decrement it and does NOT post to the ledger.
--   commit_wholesale_order → run at "Payment received": decrements stock, writes the stock ledger,
--                            and books the sales-ledger credit. Idempotent via payment_confirmed_at.
--
-- An order is only counted as a real sale (revenue / receivables) once payment_confirmed_at is set;
-- the app layer enforces that via isCountableSale() (channel='wholesale' && payment_confirmed_at null
-- ⇒ not yet counted). Rejecting an uncommitted order must NOT restore stock (none was taken) — the
-- app guards that too.

create or replace function public.place_wholesale_order(
  p_customer uuid,
  p_items jsonb,
  p_allow_oversell boolean default false
) returns jsonb language plpgsql as $$
declare
  cust public.customers; it jsonb; prod public.products;
  v_order uuid; v_qty int; v_price int; v_total bigint := 0; v_min bigint;
begin
  select * into cust from public.customers where id = p_customer;
  if cust is null or not (cust.type = 'wholesale' or cust.wholesale_approved) then
    raise exception 'Not an approved wholesale party';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in the order';
  end if;

  -- pre-validate stock + compute total (NO decrement here)
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    if not p_allow_oversell and prod.qty < v_qty then
      raise exception 'Not enough stock for % — % available, % ordered', prod.sku, prod.qty, v_qty;
    end if;
    v_total := v_total + (public.aj_tier_price(prod, 'wholesale')::bigint * v_qty);
  end loop;

  select coalesce(wholesale_min_order, 300000) into v_min from public.pricing_settings limit 1;
  if v_total < coalesce(v_min, 300000) then
    raise exception 'Minimum wholesale order is Rs %', (coalesce(v_min,300000) / 100);
  end if;

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone)
  values ('wholesale', 'pending', 0, 'credit', cust.id, cust.name, cust.phone)
  returning id into v_order;

  -- items only — stock + ledger are deferred to commit_wholesale_order()
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    v_price := public.aj_tier_price(prod, 'wholesale');
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, v_qty, v_price, v_price * v_qty, public.aj_tier_price(prod, 'mrp'));
  end loop;

  update public.orders set total = v_total where id = v_order;
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

-- Commit an awaiting-payment wholesale order: decrement stock, write stock ledger, book revenue.
-- Called once, at the owner's "Payment received" confirmation. Oversell is allowed here because the
-- money has already been received — the order must go through (stock clamps at 0). Idempotent: if the
-- order is already payment-confirmed, it does nothing.
create or replace function public.commit_wholesale_order(p_order uuid)
returns void language plpgsql as $$
declare o public.orders; li record; v_has_stock boolean; v_has_ledger boolean;
begin
  select * into o from public.orders where id = p_order;
  if o is null then raise exception 'Order % not found', p_order; end if;
  if o.channel <> 'wholesale' then return; end if;
  if o.payment_confirmed_at is not null then return; end if; -- already committed
  if o.status in ('cancelled','void','refunded') then return; end if;

  -- Idempotency guards. A wholesale order placed BEFORE this migration already moved stock and
  -- booked revenue at placement — committing it again would double-count. So only move stock / book
  -- the ledger if this order hasn't already done so.
  select exists(select 1 from public.stock_adjustments where source = 'wholesale order ' || p_order) into v_has_stock;
  select exists(select 1 from public.ledger where kind = 'sales' and ref_id = p_order) into v_has_ledger;

  if not v_has_stock then
    for li in select oi.product_id, oi.qty, p.sku
                from public.order_items oi join public.products p on p.id = oi.product_id
               where oi.order_id = p_order loop
      update public.products
         set qty = greatest(0, qty - li.qty), last_movement_at = now()
       where id = li.product_id;
      insert into public.stock_adjustments(product_id, sku, delta, source, kind)
      values (li.product_id, li.sku, -li.qty, 'wholesale order ' || p_order, 'sale');
    end loop;
  end if;

  if not v_has_ledger then
    -- Book the sale at the order's final (tier-discounted) total.
    insert into public.ledger(kind, ref_id, credit, note)
    values ('sales', p_order, o.total, 'wholesale order ' || p_order);
  end if;
end; $$;


-- ------------------------------------------------------------ 0061_pricing_1p5_4x.sql
-- 0061 — New pricing structure (client instruction):
--   • wholesale/POS price = the entered base wholesale, AS-IS (no markup — was +10%)
--   • retail selling price = 1.5 × wholesale   (then charm-rounded UP to end in 9)
--   • printed MRP          = 4   × wholesale   (then rounded to a multiple of 5, never below retail)
--
-- Two parts, both required:
--   (A) UPDATE the live pricing_settings row — this is what re-prices the whole catalogue now.
--   (B) CREATE OR REPLACE bd_price with matching coalesce defaults, so a fresh/NULL column can
--       never fall back to the old 10% / 2.2× / 2.75× numbers. Mirrors lib/pricing.ts exactly.
--
-- NOTE: products with an explicit per-product/variant override (wholesale_override / retail_override
-- / mrp_override) keep their pinned price — the formula only drives non-overridden items. Clear those
-- overrides if you want every product re-priced by this formula.

-- (A) Re-price the catalogue: markup 0, retail ×1.5, MRP ×4, simple-multiplier mode.
update public.pricing_settings
   set wholesale_markup_pct = 0,
       retail_multiplier    = 1.5,
       mrp_multiplier       = 4,
       use_buildup          = false;

-- (B) Keep the DB pricing function's fallback defaults in lock-step with the new values.
CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; bump int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    -- %-build-up chain (owner's costing sheet). Wholesale = the entered base.
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers (current formula): NO wholesale markup, retail ×1.5, MRP ×4.
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 0) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 1.5);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
  end if;

  -- RETAIL: charm-round UP to the next whole rupee ending in 9 (paise in / paise out).
  ret_rupees := greatest(1, round(retail_raw / 100.0)::int);
  bump       := ((9 - (ret_rupees % 10)) + 10) % 10;
  retail_out := (ret_rupees + bump) * 100;

  -- MRP: nearest whole rupee ending in 0/5, never printed below the retail selling price.
  mrp_rupees := round(mrp_raw / 100.0 / 5.0)::int * 5;
  if mrp_rupees <= 0 then mrp_rupees := 5; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 5.0)::int * 5) * 100;
  end if;

  return (case p_tier
            when 'wholesale' then wholesale_out
            when 'mrp' then mrp_out
            else retail_out end)::int;
end; $function$;

-- Sanity probes (run manually to confirm the new structure):
--   select public.bd_price(25000,'wholesale'); -- expect 25000  (₹250 — AS-IS, no markup)
--   select public.bd_price(25000,'retail');    -- expect 37900  (250×1.5=375 → charm ₹379)
--   select public.bd_price(25000,'mrp');       -- expect 100000 (250×4=1000 → ₹1000)
--   select public.bd_price(15000,'retail');    -- expect 22900  (150×1.5=225 → charm ₹229)
--   select public.bd_price(15000,'mrp');       -- expect 60000  (150×4=600 → ₹600)


-- ------------------------------------------------------------ 0062_retail_round5_min10k_accounts.sql
-- 0062 — three client changes:
--   1. RETAIL price now rounds to the nearest 0/5 (like MRP), not "ends in 9".
--   2. Wholesale minimum order raised ₹3,000 → ₹10,000.
--   3. Self-service wholesale accounts: add customers.password_hash (buyers log in at checkout).

-- (2) Minimum wholesale order → ₹10,000 (paise).
update public.pricing_settings set wholesale_min_order = 1000000;

-- (3) Password for self-service trade accounts (scrypt hash written by the app; never plaintext).
alter table public.customers add column if not exists password_hash text;

-- (1) Mirror the retail rounding change into the DB pricing function: retail → nearest 0/5.
CREATE OR REPLACE FUNCTION public.bd_price(p_base integer, p_tier text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; mrp_rupees int; floor_rupees int;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);

  if coalesce(ps.use_buildup, false) then
    shipped       := p_base::numeric * (1 + coalesce(ps.shipping_pct, 0) / 100);
    landed        := shipped + coalesce(ps.packing_flat, 0) + coalesce(ps.promotion_flat, 0);
    withreseller  := landed * (1 + coalesce(ps.reseller_pct, 0) / 100);
    retail_raw    := withreseller * (1 + coalesce(ps.customer_discount_pct, 0) / 100);
    mrp_raw       := retail_raw * (1 + coalesce(ps.mrp_pct, 0) / 100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    -- Simple multipliers: NO wholesale markup, retail ×1.5, MRP ×4.
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct, 0) / 100)) / v_round) * v_round;
    retail_raw    := p_base::numeric * coalesce(ps.retail_multiplier, 1.5);
    mrp_raw       := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
  end if;

  -- RETAIL: nearest whole rupee ending in 0/5 (client rule — same rounding as MRP).
  ret_rupees := round(retail_raw / 100.0 / 5.0)::int * 5;
  if ret_rupees <= 0 then ret_rupees := 5; end if;
  retail_out := ret_rupees * 100;

  -- MRP: nearest whole rupee ending in 0/5, never printed below the retail selling price.
  mrp_rupees := round(mrp_raw / 100.0 / 5.0)::int * 5;
  if mrp_rupees <= 0 then mrp_rupees := 5; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 5.0)::int * 5) * 100;
  end if;

  return (case p_tier
            when 'wholesale' then wholesale_out
            when 'mrp' then mrp_out
            else retail_out end)::int;
end; $function$;

-- Sanity probes:
--   select public.bd_price(15000,'retail'); -- expect 22500 (150×1.5=225 → ₹225, ends in 5)
--   select public.bd_price(25000,'retail'); -- expect 37500 (250×1.5=375 → ₹375)
--   select public.bd_price(15000,'mrp');    -- expect 60000 (150×4=600 → ₹600)


-- ------------------------------------------------------------ 0063_subcategories_image_style.sql
-- 0063 — add the per-subcategory AI photo model column.
-- The app code (getCategoryTree select, setSubcategoryStyleAction write, the Categories page
-- "AI model" dropdown, and getProductBySku's rich embed) all reference subcategories.image_style,
-- but no migration ever created it. On any DB where the column was absent, the subcategories
-- SELECT failed all-or-nothing, so NO subcategories rendered and "+ Subcategory" looked dead even
-- though the insert succeeded. Adding it (nullable text; NULL = "auto" model) fixes the display.
alter table public.subcategories add column if not exists image_style text;


-- ------------------------------------------------------------ 0064_orders_merge_variants.sql
-- Bills can optionally MERGE colour variants of the same product into one line on the printed
-- invoice/cash-memo (e.g. 3 blue + 4 yellow + 5 pink necklaces -> "Necklace  ×12"). The counter
-- still bills per-variant (so each variant's stock decrements correctly); this flag only controls
-- how the finished bill is DISPLAYED. Default false = itemise each variant as before.
alter table public.orders
  add column if not exists merge_variants boolean not null default false;


-- ------------------------------------------------------------ 0065_place_order_resolve_variant_sku.sql
-- FIX: POS billing failed with "Product <sku> not found" whenever a VARIANT SKU (e.g. AJSIGDE391-26)
-- was billed. place_order only looked up the products table by sku, then expected a separate 'color'
-- field to pick the variant. But the counter bills by the code printed on the label — which is the
-- VARIANT sku — with no colour. So the lookup missed and threw.
--
-- Now place_order resolves the billed sku as a product FIRST; if that misses, it treats the sku as a
-- variant sku and loads its parent product. The legacy "product sku + color" path still works. Stock
-- decrements per-variant exactly as before.
CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'pos'::text, p_payment text DEFAULT 'cash'::text, p_allow_oversell boolean DEFAULT false, p_tier text DEFAULT 'retail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  it jsonb; prod public.products; var public.variants;
  v_order uuid; v_customer uuid; v_qty int; v_price int; v_mrp int; v_total bigint := 0;
  v_color text; v_avail int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to bill';
  end if;
  v_customer := public.aj_upsert_customer(p_customer);

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone, amount_paid)
  values (p_channel::order_channel, 'completed', 0, p_payment, v_customer,
          nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));

    -- Resolve the billed SKU: PRODUCT first, else treat it as a VARIANT sku and load its parent.
    var := null;
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then
      select * into var from public.variants where upper(sku) = upper(it->>'sku') limit 1;
      if var.id is not null then
        select * into prod from public.products where id = var.product_id limit 1;
      end if;
    end if;
    if prod is null then
      raise exception 'Product % not found', it->>'sku';
    end if;

    -- Legacy: product sku + explicit colour resolves the variant by colour.
    if var.id is null then
      v_color := nullif(trim(coalesce(it->>'color','')), '');
      if v_color is not null then
        select * into var from public.variants
        where product_id = prod.id and lower(color) = lower(v_color) limit 1;
      end if;
    end if;

    v_avail := coalesce(var.qty, prod.qty);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed', coalesce(var.sku, prod.sku), v_avail, v_qty;
    end if;

    v_price := public.aj_tier_price(prod, p_tier);
    if var.id is not null then
      v_price := case p_tier
        when 'wholesale' then coalesce(var.wholesale_override, v_price)
        else coalesce(var.retail_override, v_price) end;
    end if;
    v_mrp := public.aj_tier_price(prod, 'mrp');

    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total, unit_mrp)
    values (v_order, prod.id, var.id, v_qty, v_price, v_price * v_qty, v_mrp);
    v_total := v_total + (v_price::bigint * v_qty);

    if var.id is not null then
      update public.variants set qty = greatest(0, qty - v_qty) where id = var.id;
      update public.products
        set qty = greatest(0, coalesce((select sum(qty) from public.variants where product_id = prod.id), 0)),
            last_movement_at = now()
        where id = prod.id;
    else
      update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    end if;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, source, kind)
    values (prod.id, var.id, coalesce(var.sku, prod.sku), -v_qty, 'order ' || v_order, 'sale');
  end loop;

  update public.orders
    set total = v_total,
        amount_paid = case when p_payment in ('cash','upi','online','bank') then v_total else 0 end,
        pay_cash = case when p_payment = 'cash' then v_total else 0 end,
        pay_bank = case when p_payment in ('upi','online','bank') then v_total else 0 end
    where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ('sales', v_order, v_total, 'order ' || v_order);

  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $function$;


-- ------------------------------------------------------------ 0066_final_estimate_any_payment_mode.sql
-- A non-GST "Final Estimate" (bill_type='cash') is NOT cash-only. Two fixes:
-- 1) Billing an estimate no longer assumes cash — the bill is created UNPAID with no mode.
-- 2) Recording a payment stamps the real tender (cash / upi / bank / split) onto payment_mode,
--    so a Final Estimate paid by UPI/bank shows and books correctly.
-- (The POS path already sets payment_mode from the chosen payment methods, for any bill type.)

CREATE OR REPLACE FUNCTION public.convert_estimate_v2(p_estimate_id uuid, p_bill_type text DEFAULT 'cash'::text, p_allow_oversell boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  est public.estimates; li record;
  v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  for li in select ei.*, p.sku as p_sku, p.qty as p_qty
            from public.estimate_items ei join public.products p on p.id = ei.product_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell and li.p_qty < li.qty then
      raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
    end if;
  end loop;

  -- payment_mode = NULL: the mode is unknown until the actual payment is recorded (any mode).
  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, null, coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
    insert into public.stock_adjustments(product_id, delta, source, kind)
    values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_order uuid, p_amount bigint, p_mode text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
        pay_bank = coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end,
        -- Stamp the tender onto the bill so a non-GST bill reflects UPI/bank/split, not just cash.
        payment_mode = case
          when (coalesce(pay_cash,0) + case when p_mode = 'cash' then v_amt else 0 end) > 0
           and (coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end) > 0 then 'split'
          when (coalesce(pay_bank,0) + case when p_mode <> 'cash' then v_amt else 0 end) > 0 then p_mode
          else 'cash' end
    where id = p_order;
  insert into public.ledger(kind, ref_id, credit, note)
  values ((case when p_mode = 'cash' then 'cash' else 'bank' end)::public.ledger_kind,
          p_order, v_amt, 'payment ' || coalesce(p_mode,'cash'));
end; $function$;


-- ------------------------------------------------------------ 0067_variant_options_add_hex.sql
-- BUG FIX: the Colours & Options master (getOptionMaster) and the add/update-option server actions
-- all reference variant_options.hex (the swatch colour), but the column never existed. Selecting a
-- missing column made the master query error out, so /admin/colours showed "Colours (0)" (and Sizes
-- 0 / Polishes 0) even though 81 colours existed — and adding/editing a colour silently failed.
-- Adding the column restores viewing, adding, editing, and the swatch picker.
alter table public.variant_options add column if not exists hex text;


-- ------------------------------------------------------------ 0068_roles_add_passcode.sql
-- BUG FIX: the entire staff-role feature was broken because roles.passcode never existed.
--  • createRoleAction inserts { name, permissions, passcode, lang } → insert rejected (unknown
--    column) → a staff role could never be created.
--  • loginAction authenticates staff via roles.eq('passcode', code) → query errored → staff could
--    never sign in with a role passcode.
--  • getRoles selects passcode and the Roles page shows it → list came back empty.
-- Adding the column (plaintext, matching loginAction's comparison + the on-screen passcode chip)
-- restores role creation, staff login, and the roles list.
alter table public.roles add column if not exists passcode text;
create unique index if not exists roles_passcode_key on public.roles(passcode) where passcode is not null;


-- ------------------------------------------------------------ 0069_estimate_variant_and_supplier_opening.sql
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


-- ------------------------------------------------------------ 0070_customer_only_with_mobile.sql
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


-- ------------------------------------------------------------ 0071_estimate_variant_sku_support.sql
-- 0071 — Estimates: resolve VARIANT skus (colour/size), not just product skus.
-- Bug: create_estimate looked up only public.products, so a real in-stock variant sku like
-- "AJPRIDE7032-GREEN" raised "Product ... not found" on save (the POS place_order already
-- handled variants; estimates did not). convert_estimate_v2 likewise decremented the parent
-- product's qty instead of the variant's. Both now mirror place_order's proven variant logic.

-- Variant-aware tier price: variant override → product override → formula on base_wholesale.
create or replace function public.aj_variant_tier_price(p_product public.products, p_variant public.variants, p_tier text)
returns integer language plpgsql stable as $$
begin
  if p_tier = 'wholesale' then
    return coalesce(p_variant.wholesale_override, p_product.wholesale_override, public.bd_price(p_product.base_wholesale, 'wholesale'));
  elsif p_tier = 'mrp' then
    return coalesce(p_variant.mrp_override, p_product.mrp_override, public.bd_price(p_product.base_wholesale, 'mrp'));
  else
    return coalesce(p_variant.retail_override, p_product.retail_override, public.bd_price(p_product.base_wholesale, 'retail'));
  end if;
end; $$;

create or replace function public.create_estimate(p_items jsonb, p_customer jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare it jsonb; prod public.products; var public.variants; v_est uuid; v_qty int; v_price int; v_total bigint := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'No items on the estimate'; end if;
  insert into public.estimates(customer_name, customer_phone, total, status)
  values (nullif(trim(coalesce(p_customer->>'name','')), ''), nullif(trim(coalesce(p_customer->>'phone','')), ''), 0, 'open')
  returning id into v_est;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    -- PRODUCT sku first, else a VARIANT sku (bill the variant, priced off its parent + own overrides).
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod.id is not null then
      v_price := public.aj_tier_price(prod, 'retail');
      insert into public.estimate_items(estimate_id, product_id, qty, unit_price, line_total)
      values (v_est, prod.id, v_qty, v_price, v_price * v_qty);
    else
      select * into var from public.variants where upper(sku) = upper(it->>'sku') limit 1;
      if var.id is null then raise exception 'Product % not found', it->>'sku'; end if;
      select * into prod from public.products where id = var.product_id;
      if prod.id is null then raise exception 'Product % not found', it->>'sku'; end if;
      v_price := public.aj_variant_tier_price(prod, var, 'retail');
      insert into public.estimate_items(estimate_id, product_id, variant_id, qty, unit_price, line_total)
      values (v_est, prod.id, var.id, v_qty, v_price, v_price * v_qty);
    end if;
    v_total := v_total + (v_price::bigint * v_qty);
  end loop;
  update public.estimates set total = v_total where id = v_est;
  return jsonb_build_object('estimate_id', v_est, 'total', v_total);
end; $$;

create or replace function public.convert_estimate_v2(p_estimate_id uuid, p_bill_type text default 'cash', p_allow_oversell boolean default false)
returns jsonb language plpgsql as $$
declare est public.estimates; li record; v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  -- Oversell guard: VARIANT stock for variant lines, else PRODUCT stock.
  for li in select ei.qty, ei.product_id, ei.variant_id, p.sku as p_sku, p.qty as p_qty, v.sku as v_sku, v.qty as v_qty
            from public.estimate_items ei
            join public.products p on p.id = ei.product_id
            left join public.variants v on v.id = ei.variant_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell then
      if li.variant_id is not null and coalesce(li.v_qty,0) < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.v_sku, coalesce(li.v_qty,0), li.qty;
      elsif li.variant_id is null and li.p_qty < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
      end if;
    end if;
  end loop;

  insert into public.orders(channel, status, total, payment_mode, bill_type, customer_name, customer_phone)
  values ('pos', 'completed', 0, null, coalesce(p_bill_type,'cash'), est.customer_name, est.customer_phone)
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.variant_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    if li.variant_id is not null then
      update public.variants set qty = greatest(0, qty - li.qty) where id = li.variant_id;
      update public.products
        set qty = greatest(0, coalesce((select sum(v.qty) from public.variants v where v.product_id = li.product_id), 0)),
            last_movement_at = now()
        where id = li.product_id;
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (li.product_id, li.variant_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    else
      update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
      insert into public.stock_adjustments(product_id, delta, source, kind)
      values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    end if;
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;


-- ------------------------------------------------------------ 0072_inventory_groups_box_qr.sql
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


-- ------------------------------------------------------------ 0073_employees_soft_delete.sql
-- 0073 — Soft-delete for employees so removal preserves history.
-- orders.sales_employee_id is ON DELETE SET NULL, so hard-deleting an employee who has bills would
-- null out (lose) the attribution on every past bill. Instead we keep the row and stamp deleted_at:
-- the roster and POS picker hide deleted staff, but historical sales still resolve their name.
alter table public.employees add column if not exists deleted_at timestamptz;
create index if not exists employees_deleted_idx on public.employees(deleted_at);


-- ------------------------------------------------------------ 0074_retail_tiered_multiplier_round10.sql
-- 0074 — Retail pricing rule update (owner):
--   • Tiered retail multiplier: base wholesale BELOW ₹1500 → 1.6×; ₹1500 & ABOVE → 1.5×.
--   • Round retail AND MRP to the nearest ₹10 (was ₹5).
-- Mirrors lib/pricing.ts so DB-priced (POS/estimate RPCs) and JS-priced (labels/display) agree.
create or replace function public.bd_price(p_base integer, p_tier text)
returns integer language plpgsql stable as $function$
declare ps record; v_round int;
        shipped numeric; landed numeric; withreseller numeric; retail_raw numeric; mrp_raw numeric;
        wholesale_out numeric; retail_out numeric; mrp_out numeric;
        ret_rupees int; mrp_rupees int; floor_rupees int; v_mult numeric;
begin
  select * into ps from pricing_settings limit 1;
  v_round := coalesce(ps.round_to, 100);
  if coalesce(ps.use_buildup, false) then
    shipped := p_base::numeric * (1 + coalesce(ps.shipping_pct,0)/100);
    landed := shipped + coalesce(ps.packing_flat,0) + coalesce(ps.promotion_flat,0);
    withreseller := landed * (1 + coalesce(ps.reseller_pct,0)/100);
    retail_raw := withreseller * (1 + coalesce(ps.customer_discount_pct,0)/100);
    mrp_raw := retail_raw * (1 + coalesce(ps.mrp_pct,0)/100);
    wholesale_out := round(p_base::numeric / v_round) * v_round;
  else
    wholesale_out := round((p_base::numeric * (1 + coalesce(ps.wholesale_markup_pct,0)/100)) / v_round) * v_round;
    -- Tiered retail multiplier: cheaper pieces get a higher markup.
    v_mult := case when p_base < 150000 then 1.6 else 1.5 end;
    retail_raw := p_base::numeric * v_mult;
    mrp_raw := p_base::numeric * coalesce(ps.mrp_multiplier, 4);
  end if;
  -- Retail & MRP round to the nearest ₹10 (prices end in 0).
  ret_rupees := round(retail_raw / 100.0 / 10.0)::int * 10;
  if ret_rupees <= 0 then ret_rupees := 10; end if;
  retail_out := ret_rupees * 100;
  mrp_rupees := round(mrp_raw / 100.0 / 10.0)::int * 10;
  if mrp_rupees <= 0 then mrp_rupees := 10; end if;
  mrp_out := mrp_rupees * 100;
  if mrp_out < retail_out then
    floor_rupees := ceil(retail_out / 100.0)::int;
    mrp_out := (ceil(floor_rupees / 10.0)::int * 10) * 100;
  end if;
  return (case p_tier when 'wholesale' then wholesale_out when 'mrp' then mrp_out else retail_out end)::int;
end; $function$;


-- ------------------------------------------------------------ 0075_cancel_restock_actual_deducted.sql
-- 0075 — Cancel must restock only what a sale actually removed.
-- Oversold/backorder bills deduct only down to 0 (greatest(0, qty - billed)), but cancel restocked the
-- FULL billed qty → phantom stock. Fix: record the ACTUAL deducted qty per line and restock exactly
-- that on cancel. Normal in-stock sales are unchanged (deducted = qty).
alter table public.order_items add column if not exists deducted_qty int;

CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_customer jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'pos'::text, p_payment text DEFAULT 'cash'::text, p_allow_oversell boolean DEFAULT false, p_tier text DEFAULT 'retail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  it jsonb; prod public.products; var public.variants;
  v_order uuid; v_customer uuid; v_qty int; v_price int; v_mrp int; v_total bigint := 0;
  v_color text; v_avail int; v_deducted int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'No items to bill'; end if;
  v_customer := public.aj_upsert_customer(p_customer);

  insert into public.orders(channel, status, total, payment_mode, customer_id, customer_name, customer_phone, amount_paid)
  values (p_channel::order_channel, 'completed', 0, p_payment, v_customer,
          nullif(trim(coalesce(p_customer->>'name','')), ''),
          nullif(trim(coalesce(p_customer->>'phone','')), ''), 0)
  returning id into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((it->>'qty')::int, 1));
    var := null;
    select * into prod from public.products where upper(sku) = upper(it->>'sku') limit 1;
    if prod is null then
      select * into var from public.variants where upper(sku) = upper(it->>'sku') limit 1;
      if var.id is not null then select * into prod from public.products where id = var.product_id limit 1; end if;
    end if;
    if prod is null then raise exception 'Product % not found', it->>'sku'; end if;
    if var.id is null then
      v_color := nullif(trim(coalesce(it->>'color','')), '');
      if v_color is not null then
        select * into var from public.variants where product_id = prod.id and lower(color) = lower(v_color) limit 1;
      end if;
    end if;

    v_avail := coalesce(var.qty, prod.qty);
    if not p_allow_oversell and v_avail < v_qty then
      raise exception 'Not enough stock for % — % available, % billed', coalesce(var.sku, prod.sku), v_avail, v_qty;
    end if;
    v_deducted := least(v_qty, greatest(0, v_avail));  -- what actually leaves stock (rest is backorder)

    v_price := public.aj_tier_price(prod, p_tier);
    if var.id is not null then
      v_price := case p_tier when 'wholesale' then coalesce(var.wholesale_override, v_price) else coalesce(var.retail_override, v_price) end;
    end if;
    v_mrp := public.aj_tier_price(prod, 'mrp');

    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total, unit_mrp, deducted_qty)
    values (v_order, prod.id, var.id, v_qty, v_price, v_price * v_qty, v_mrp, v_deducted);
    v_total := v_total + (v_price::bigint * v_qty);

    if var.id is not null then
      update public.variants set qty = greatest(0, qty - v_qty) where id = var.id;
      update public.products set qty = greatest(0, coalesce((select sum(qty) from public.variants where product_id = prod.id), 0)), last_movement_at = now() where id = prod.id;
    else
      update public.products set qty = greatest(0, qty - v_qty), last_movement_at = now() where id = prod.id;
    end if;
    insert into public.stock_adjustments(product_id, variant_id, sku, delta, source, kind)
    values (prod.id, var.id, coalesce(var.sku, prod.sku), -v_deducted, 'order ' || v_order, 'sale');
  end loop;

  update public.orders
    set total = v_total,
        amount_paid = case when p_payment in ('cash','upi','online','bank') then v_total else 0 end,
        pay_cash = case when p_payment = 'cash' then v_total else 0 end,
        pay_bank = case when p_payment in ('upi','online','bank') then v_total else 0 end
    where id = v_order;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'order ' || v_order);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order uuid, p_reason text DEFAULT 'Cancelled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare o record; it record; v_restock int; v_restocked int := 0; v_refund bigint := 0;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','void','refunded') then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;

  for it in
    select oi.*, upper(p.sku) as psku from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order
  loop
    -- Restock what this line actually removed from stock (legacy rows: deducted_qty null -> qty),
    -- net of pieces already returned. A backorder line that never deducted restocks nothing.
    v_restock := greatest(0, coalesce(it.deducted_qty, it.qty) - coalesce(it.returned_qty, 0));
    if v_restock > 0 then
      if it.variant_id is not null then
        update public.variants set qty = qty + v_restock where id = it.variant_id;
        update public.products set qty = (select coalesce(sum(qty),0) from public.variants where product_id = it.product_id), last_movement_at = now() where id = it.product_id;
      else
        update public.products set qty = qty + v_restock, last_movement_at = now() where id = it.product_id;
      end if;
      insert into public.stock_adjustments(product_id, variant_id, sku, delta, kind, source, reason, ref_id)
        values (it.product_id, it.variant_id, it.psku, v_restock, 'cancel', 'order ' || p_order || ' cancelled', coalesce(nullif(p_reason,''),'Cancelled'), p_order);
      v_restocked := v_restocked + v_restock;
    end if;
  end loop;

  insert into public.ledger(kind, ref_id, debit, note)
    values ('sales', p_order, greatest(0, coalesce(o.total,0) - coalesce(o.return_amount,0)), 'Order cancelled: ' || coalesce(nullif(p_reason,''),'-'));
  if coalesce(o.pay_cash,0) > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('cash', p_order, o.pay_cash, 'Refund on cancel'); end if;
  if coalesce(o.pay_bank,0) > 0 then insert into public.ledger(kind, ref_id, debit, note) values ('bank', p_order, o.pay_bank, 'Refund on cancel'); end if;
  v_refund := coalesce(o.pay_cash,0) + coalesce(o.pay_bank,0);

  update public.orders
    set status = 'cancelled', amount_paid = 0, pay_cash = 0, pay_bank = 0,
        admin_note = trim(coalesce(admin_note,'') || ' [Cancelled: ' || coalesce(nullif(p_reason,''),'-') || ']')
    where id = p_order;

  insert into public.audit_log(actor, action, ref, detail)
    values ('staff', 'order_cancelled', p_order::text, coalesce(p_reason,'Cancelled') || ' · restocked ' || v_restocked || ' pcs · refund reversed ' || v_refund || 'p');
  return jsonb_build_object('ok', true, 'restocked', v_restocked, 'refund', v_refund);
end; $function$;


-- ------------------------------------------------------------ 0076_estimate_pos_parity.sql
-- Estimates were missing POS fields that must survive conversion to a bill:
--   • sales_employee_id — "Sold by" never copied, so estimate→bill sales vanished from employee tallies
--   • customer_id, buyer GSTIN/address, price tier, merge_variants — POS captures these; quotes did not
-- convert_estimate_v2 now stamps those onto the order in the same atomic write as the bill itself.
alter table public.estimates
  add column if not exists sales_employee_id uuid references public.employees(id) on delete set null;
alter table public.estimates
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.estimates
  add column if not exists buyer_gstin text;
alter table public.estimates
  add column if not exists buyer_address text;
alter table public.estimates
  add column if not exists price_tier text not null default 'retail';
alter table public.estimates
  add column if not exists merge_variants boolean not null default false;
create index if not exists idx_estimates_sales_employee on public.estimates(sales_employee_id);

create or replace function public.convert_estimate_v2(p_estimate_id uuid, p_bill_type text default 'cash', p_allow_oversell boolean default false)
returns jsonb language plpgsql as $$
declare est public.estimates; li record; v_order uuid; v_total bigint := 0;
begin
  select * into est from public.estimates where id = p_estimate_id for update;
  if est is null then raise exception 'Estimate not found'; end if;
  if est.status = 'converted' then raise exception 'Estimate is already billed'; end if;

  for li in select ei.qty, ei.product_id, ei.variant_id, p.sku as p_sku, p.qty as p_qty, v.sku as v_sku, v.qty as v_qty
            from public.estimate_items ei
            join public.products p on p.id = ei.product_id
            left join public.variants v on v.id = ei.variant_id
            where ei.estimate_id = p_estimate_id loop
    if not p_allow_oversell then
      if li.variant_id is not null and coalesce(li.v_qty,0) < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.v_sku, coalesce(li.v_qty,0), li.qty;
      elsif li.variant_id is null and li.p_qty < li.qty then
        raise exception 'Not enough stock for % — % available, % on the estimate', li.p_sku, li.p_qty, li.qty;
      end if;
    end if;
  end loop;

  insert into public.orders(
      channel, status, total, payment_mode, bill_type,
      customer_name, customer_phone, customer_id,
      sales_employee_id, buyer_gstin, buyer_address, merge_variants
    )
  values (
      'pos', 'completed', 0, null, coalesce(p_bill_type,'cash'),
      est.customer_name, est.customer_phone, est.customer_id,
      est.sales_employee_id, est.buyer_gstin, est.buyer_address, coalesce(est.merge_variants, false)
    )
  returning id into v_order;

  for li in select ei.* from public.estimate_items ei where ei.estimate_id = p_estimate_id loop
    insert into public.order_items(order_id, product_id, variant_id, qty, unit_price, line_total)
    values (v_order, li.product_id, li.variant_id, li.qty, li.unit_price, li.line_total);
    v_total := v_total + li.line_total;
    if li.variant_id is not null then
      update public.variants set qty = greatest(0, qty - li.qty) where id = li.variant_id;
      update public.products
        set qty = greatest(0, coalesce((select sum(v.qty) from public.variants v where v.product_id = li.product_id), 0)),
            last_movement_at = now()
        where id = li.product_id;
      insert into public.stock_adjustments(product_id, variant_id, delta, source, kind)
      values (li.product_id, li.variant_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    else
      update public.products set qty = greatest(0, qty - li.qty), last_movement_at = now() where id = li.product_id;
      insert into public.stock_adjustments(product_id, delta, source, kind)
      values (li.product_id, -li.qty, 'estimate ' || p_estimate_id, 'sale');
    end if;
  end loop;

  update public.orders set total = v_total where id = v_order;
  update public.estimates set status = 'converted', order_id = v_order where id = p_estimate_id;
  insert into public.ledger(kind, ref_id, credit, note) values ('sales', v_order, v_total, 'billed estimate ' || p_estimate_id);
  return jsonb_build_object('order_id', v_order, 'total', v_total);
end; $$;

