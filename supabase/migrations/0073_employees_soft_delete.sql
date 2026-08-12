-- 0073 — Soft-delete for employees so removal preserves history.
-- orders.sales_employee_id is ON DELETE SET NULL, so hard-deleting an employee who has bills would
-- null out (lose) the attribution on every past bill. Instead we keep the row and stamp deleted_at:
-- the roster and POS picker hide deleted staff, but historical sales still resolve their name.
alter table public.employees add column if not exists deleted_at timestamptz;
create index if not exists employees_deleted_idx on public.employees(deleted_at);
