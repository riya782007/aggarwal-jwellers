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
