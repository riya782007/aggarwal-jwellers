-- BUG FIX: the Colours & Options master (getOptionMaster) and the add/update-option server actions
-- all reference variant_options.hex (the swatch colour), but the column never existed. Selecting a
-- missing column made the master query error out, so /admin/colours showed "Colours (0)" (and Sizes
-- 0 / Polishes 0) even though 81 colours existed — and adding/editing a colour silently failed.
-- Adding the column restores viewing, adding, editing, and the swatch picker.
alter table public.variant_options add column if not exists hex text;
