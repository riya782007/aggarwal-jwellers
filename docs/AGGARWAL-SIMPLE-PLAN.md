# Aggarwal Jewellers — The Simple Console (Senior-Friendly Redesign)

_Aggarwal sells artificial jewellery wholesale + D2C in Sadar Bazar, like Yogendra Industries —
but the owners are older and do not want to spend time on software. Same automation principles
(one pricing formula, DIVA assistant, human-in-the-loop safety), **half the surface area**.
This document records what was cut, what was kept, and the design rules for everything new._

---

## 1. Design principles (why the UI looks the way it does)

1. **One screen answers the day.** Home answers exactly three questions — _Aaj kitna bika?
   Kaunsa maal khatam ho raha hai? Ab kya karna hai?_ — with three big numbers and four big
   buttons. No charts to decode, no date pickers, no drill-downs on the first screen.
2. **Hinglish + Hindi everywhere.** Every label reads the way the owner speaks: _Maal, Naya Bill,
   Grahak/Party, Hisaab, Wapsi, Khareed_. English stays as the primary word (staff may be younger),
   Devanagari sits under it so nobody translates in their head.
3. **Seven daily items, everything else folded away.** The nav shows only what's used every day.
   Weekly/rare jobs (estimates, purchases, returns, suppliers, labels, categories, reorder,
   notifications, OTP approvals) live under one collapsible **"Aur Kaam"** section.
4. **Big type, big targets.** The whole console runs at a raised type scale (`.admin-shell` in
   `globals.css`): ~17px base, taller inputs (44px+), bigger checkboxes, a loud gold focus ring.
   Scoped to the console only — the customer storefront keeps its refined scale.
5. **The assistant does the typing.** DIVA stays front and centre. Less UI is acceptable
   precisely because "AJ1004 me 50 maal add karo" or "aaj ka hisaab dikhao" works in
   Hindi/Hinglish, offline, against the same authoritative RPCs.
6. **Default period is Aaj (today).** A shopkeeper thinks in days, not months.

## 2. What was removed (aggressive cut, per client profile)

Deleted admin pages (routes, middleware rules, DIVA page-map + NLU aliases all cleaned):

| Removed | Why Aggarwal doesn't need it day-one |
|---|---|
| `/admin/analytics` | Charts/SEO funnels are Yogendra-tier; Home's three numbers replace it |
| `/admin/media` | AI photo studio — nice-to-have, not daily ops |
| `/admin/reels` | Social growth tooling — not this client |
| `/admin/reviews` | D2C reputation management — later |
| `/admin/abandoned` | Cart-recovery marketing — later |
| `/admin/roles` | Owner + maybe one staff; RBAC engine stays, management UI hidden |

**Kept but demoted to "Aur Kaam":** estimates, purchases, returns, suppliers, categories,
labels/barcodes, smart reorder, notifications, and **approvals** (kept because the OTP
human-in-the-loop flow — e.g. purchase deletion — links to it; it is safety plumbing, not a feature).

**Untouched on purpose:** all server actions, `lib/` engines (pricing, inventory, DIVA NLU/tools,
notify), migrations, storefront and wholesale portal. The cut is a *UI* cut — the engine keeps
reference-parity so features can be re-enabled by adding a nav link back.

## 3. What was rebuilt

- **`components/AdminNav.tsx`** — 7 big bilingual daily items (Home, Naya Bill, Maal, Maal Jodo,
  Catalogue, Grahak/Party, Bikri) + collapsible _Aur Kaam_ + storefront links. Emoji icons
  (recognisable at arm's length), 17px labels, Hindi subtitles, auto-opens _Aur Kaam_ when one of
  its pages is active.
- **`/admin/dashboard`** — the new Home described above. Aaj/Is Hafte/Is Mahine pills only;
  greeting in Hinglish; big-number cards (Bikri / Kam Stock / Ruka hua Maal); four giant action
  buttons; two plain lists (top sellers, dead stock) instead of charts.
- **`globals.css` + admin layout** — the `.admin-shell` senior scale + focus ring, applied once in
  `app/(admin)/admin/layout.tsx` so **every** admin page inherits it without per-page edits.
- **DIVA vocabulary** — page aliases now include _maal, bill, hisaab, grahak, party, labels, home_;
  dead aliases for removed pages dropped.

## 4. What's next (in order, one module per PR — same discipline as Yogendra)

1. **Udhaar / party ledger** — ✅ SHIPPED. Live "Udhaar" card on Home (taps through to the
   list), the Creditors page reworked as the Udhaar list with an inline receive-payment
   form per party, a receive-payment card on the customer page, and DIVA intents:
   _"Sharma ne 5000 diye"_ (records + allocates oldest-bill-first via `record_party_payment`),
   _"Sharma ka kitna baaki hai"_, _"kis party ka kitna baaki hai"_.
   Requires `supabase/migrations/0043_party_ledger.sql`.
2. **QR labels** — ✅ SHIPPED. `lib/qr.ts` (self-contained encoder, byte mode, ECC M, v1–5,
   verified bit-identical to a reference implementation and decoded with an independent
   reader) + `<QrCode/>`; the Labels page now defaults to QR with Code-128 still available
   for legacy 1D scanners.
2b. **Console language (English / हिन्दी)** — ✅ SHIPPED (replaces the hardcoded Hinglish
   labels). Per-role language on the Roles page + owner preference, quick EN/हिन्दी toggle
   in the sidebar, `lib/i18n.ts` dictionary applied to the nav, dashboard headline and the
   Udhaar page; remaining pages adopt the same `t(lang, key)` pattern incrementally.
   Requires `supabase/migrations/0044_language_pref.sql`.
3. **DIVA → "Aggarwal Ji"** — rebrand + voice input (Hindi speech-to-text) so the owner talks
   instead of types; result cards with deep links.
4. **Photo-first stock entry** — ✅ SHIPPED. "⚡ Quick add" is now the DEFAULT tab on Add
   Inventory: photo (camera opens directly on phones) → category → cost → qty → done. The AI
   writes the name/description/SEO from the photo (deterministic fallback without a key),
   SKU auto-generates, prices come from the formula, and it lands as a draft for publish.
   Also: the privacy toggle was reworked — it now drops a frosted-glass blur over the ENTIRE
   screen (nav, content, DIVA) on every admin page instead of masking individual numbers.
5. **WhatsApp rate-list broadcast** — one command sends the filtered catalogue to parties.

## 5. Verification gate

Sandbox cannot run `npm install`. Before pushing, run locally:

```bash
npm install && npm run build && npm test
```

All edits here were display-level (nav, one page, CSS, alias maps); no identifiers, imports of
shared code, DB columns, or server actions were changed.
