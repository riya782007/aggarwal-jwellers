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
