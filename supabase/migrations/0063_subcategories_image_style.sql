-- 0063 — add the per-subcategory AI photo model column.
-- The app code (getCategoryTree select, setSubcategoryStyleAction write, the Categories page
-- "AI model" dropdown, and getProductBySku's rich embed) all reference subcategories.image_style,
-- but no migration ever created it. On any DB where the column was absent, the subcategories
-- SELECT failed all-or-nothing, so NO subcategories rendered and "+ Subcategory" looked dead even
-- though the insert succeeded. Adding it (nullable text; NULL = "auto" model) fixes the display.
alter table public.subcategories add column if not exists image_style text;
