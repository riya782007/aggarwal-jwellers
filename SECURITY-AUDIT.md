# Secret-Safety Audit — Aggarwal Jewellers (17 Jul 2026)

Full-codebase pass before production. **Repo is public** (`github.com/riya782007/aggarwal-jwellers`),
so "anything a reader of the source can do" is the threat model.

## 🔴 Critical — found & fixed

**Forgeable admin session cookie.** The owner/staff session cookie value was a fixed public
string (`bd-owner-session-v1` / `…-staff`) whenever `ADMIN_SESSION_TOKEN` was unset. Because the
source is public, anyone could open dev-tools, run
`document.cookie = "bd_session=bd-owner-session-v1"`, reload `/admin`, and get the **full owner
console with no passcode**. Reproduced live during this audit (landed on the real dashboard —
revenue, customers, cashbook). Critically, this bypass worked **even though the owner set a custom
`OWNER_PASSCODE`**, because the cookie value didn't depend on any secret.

**Fix:** the session token is now `SHA-256("owner|" + ADMIN_SESSION_TOKEN + "|" + OWNER_PASSCODE + "|aj-session-v2")`
— derived from the deployment's secrets, unguessable from source, and it auto-rotates if either
secret changes. `lib/auth.ts` (Node `crypto`) and `middleware.ts` (Edge Web-Crypto) derive the
**same** hash so the gate and the pages agree. Since the live site has a custom `OWNER_PASSCODE`,
the forgery is closed the moment this deploys. (Redeploying invalidates the current cookie → the
owner simply logs in again.)

## 🟡 Hardening applied

- **`.env.example`** now documents the security-critical trio (`OWNER_PASSCODE`,
  `ADMIN_SESSION_TOKEN`, `OWNER_OTP`) with a note that leaving them unset = insecure.
- Login page no longer prints the demo passcode (fixed in the prior push).

## ✅ Verified clean

| Check | Result |
|---|---|
| Hardcoded API keys / tokens / private keys in source | **None.** Every provider key (Gemini, OpenAI, Twilio, Razorpay secret, Supabase service-role) is read only via `process.env.*` |
| Supabase **service-role** key | server-only — `lib/supabase/server.ts` (no `"use client"`), never in a client bundle |
| Supabase **anon** key exposure | only in `lib/supabase/browser.ts`, which is **imported nowhere**; RLS is enabled on every sensitive table (migration `0005`), so even a leaked anon key can't read orders/customers/ledger/roles |
| `NEXT_PUBLIC_*` vars | only client-safe values: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORE_NAME`, `GA4_ID`, `RAZORPAY_KEY_ID` (publishable). **No secret** uses a public prefix |
| Razorpay | publishable `KEY_ID` client-side; `KEY_SECRET` + `WEBHOOK_SECRET` server-only ✓ |
| `.gitignore` | `.env` and `.env.local` ignored; `.env.example` (placeholders only) is what's committed |
| Log / response leaks | no `console.*` prints a passcode/token/key/secret/OTP value; RPC error logs added in the QA pass print only `error.message` |
| Permission enforcement | `authoritativePerms()` re-reads role perms from the DB, so a tampered `bd_perms` cookie can't escalate; middleware + `requirePerm` double-gate |

## ⚠️ Deployment requirements (set in Vercel → Settings → Environment Variables)

1. **`ADMIN_SESSION_TOKEN`** — set to a long random string (`openssl rand -hex 32`). Defense-in-depth; with it set, the session token is unguessable regardless of the passcode.
2. **`OWNER_PASSCODE`** — already set to a custom value (confirmed: the demo `aggarwal2026` no longer works). Keep it private.
3. **`OWNER_OTP`** — set a private numeric OTP (guards sensitive purchase actions).
4. **Git history:** the old default strings (`bd-owner-session-v1`, `aggarwal2026`, `482913`) live in past commits. They're now inert (the token no longer equals the raw env value, and the passcode is overridden in env), but as hygiene, keep `OWNER_PASSCODE`/`ADMIN_SESSION_TOKEN` set to private values and never commit real secrets.
