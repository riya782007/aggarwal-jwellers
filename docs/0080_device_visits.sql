-- 0080 — device usage (phone / tablet / PC, and Android app) per admin screen.
-- Already applied in production on 5 Oct 2026. Idempotent: safe to re-run.
create table if not exists public.device_visits (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  role    text,
  path    text,
  device  text,
  os      text,
  browser text
);
create index if not exists idx_device_visits_at on public.device_visits (at);
alter table public.device_visits enable row level security;
