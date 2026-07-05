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
