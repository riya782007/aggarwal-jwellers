-- Bills can optionally MERGE colour variants of the same product into one line on the printed
-- invoice/cash-memo (e.g. 3 blue + 4 yellow + 5 pink necklaces -> "Necklace  ×12"). The counter
-- still bills per-variant (so each variant's stock decrements correctly); this flag only controls
-- how the finished bill is DISPLAYED. Default false = itemise each variant as before.
alter table public.orders
  add column if not exists merge_variants boolean not null default false;
