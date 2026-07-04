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

1. **Udhaar / party ledger** — "kis party ka kitna baaki hai" as a first-class card on Home and a
   simple list under Grahak/Party. (Schema needs the receivables migration from the reference.)
2. **QR labels** — replace Code128 with QR (`lib/qr.ts`), sized to Aggarwal's sticker.
3. **DIVA → "Aggarwal Ji"** — rebrand + voice input (Hindi speech-to-text) so the owner talks
   instead of types; result cards with deep links.
4. **Photo-first stock entry** — upload page trimmed to: photo → category → cost → qty → done
   (assistant fills the rest), per the client questionnaire's top wish.
5. **WhatsApp rate-list broadcast** — one command sends the filtered catalogue to parties.

## 5. Verification gate

Sandbox cannot run `npm install`. Before pushing, run locally:

```bash
npm install && npm run build && npm test
```

All edits here were display-level (nav, one page, CSS, alias maps); no identifiers, imports of
shared code, DB columns, or server actions were changed.
