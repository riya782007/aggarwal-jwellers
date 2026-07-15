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
