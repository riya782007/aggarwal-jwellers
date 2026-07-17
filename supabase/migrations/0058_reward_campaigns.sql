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
