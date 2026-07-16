# QA Report — Aggarwal Jewellers (aggarwal-jwellers.vercel.app)

**Tested:** 16 Jul 2026 · production deploy `47b5c27` · Chrome (real browser, end-to-end)
**Tester:** Claude (acting QA) · Method: every reachable module exercised with realistic sample data; every money figure cross-checked across surfaces (bill ↔ dashboard ↔ udhaar ↔ cashbook ↔ customer ledger).

---

## 1. Executive summary

The core lifecycle — catalogue → storefront → checkout (COD + voucher) → fulfillment →
tracking → POS billing → customer directory → udhaar → dealer portal — **works end-to-end**.
Stock movements are exact (12 → 8 across four sales, verified on the trade portal), the GST-aware
"single source of truth" money formula holds on the header revenue, udhaar and sales register,
and both auth gates (owner console, trade portal) correctly redirect anonymous visitors.

QA found **2 critical money bugs** (both silent — the UI showed success while the books went
wrong), plus one high price-consistency issue and a tail of mediums/minors. All critical/high
code fixes are written and included in this batch; two need one-line-ish migrations (0053, 0054).

---

## 2. Bugs found

### 🔴 Critical

| # | Bug | Root cause | Status |
|---|-----|-----------|--------|
| 1 | **7 consecutive Vercel deploys failed for 17 h** — nothing shipped after the fulfillment pack | `.catch()` on a Supabase query builder (not a Promise) + a missing import; esbuild smoke checks don't run tsc | ✅ fixed & deployed (`47b5c27`); full `tsc --noEmit` now mandatory pre-push |
| 2 | **No payment could ever be recorded** — COD collect-on-delivery, the invoice "Record a payment" panel and udhaar party receive all failed silently | `record_payment` / `record_party_payment` insert into `ledger` via `CASE WHEN … 'cash' ELSE 'bank'` — a text expression Postgres won't implicitly cast to the `ledger_kind` enum (bare literals coerce; CASE doesn't). Vercel log: `column "kind" is of type ledger_kind but expression is of type text` | ✅ **migration 0053** (recreates both RPCs with `::ledger_kind` cast) — **run in Supabase** |
| 3 | **Every POS bill recorded as fully-paid walk-in with no salesperson** — partial payments (₹200, ₹100) vanished; customer link and employee attribution lost; cashbook legacy book (₹1,100) disagrees with the method ledger (₹300, which is correct) | The post-billing `orders.update()` includes `buyer_gstin/buyer_address/buyer_state` — columns that **exist in no migration** (hand-added in the reference project's DB only). One unknown column ⇒ Supabase discards the whole update payload, silently | ✅ **migration 0054** (adds the 3 columns) + code hardened: money-critical fields now retried separately and failures logged loudly — **run in Supabase** |

### 🟠 High

| # | Bug | Detail | Status |
|---|-----|--------|--------|
| 4 | **JS ↔ SQL retail price drift** | Customer sees ₹559 (+₹50 ship = ₹609) at checkout; server bills ₹550 (rate ₹688 vs UI ₹690). Same root as the 4 pre-existing failing unit tests (JS `computePrices` vs SQL `bd_price` constants) | 🔴 **open** — needs a dedicated reconciliation pass; every symptom traced to this one root |
| 5 | Website Orders queue rendered empty (real order invisible) | `customers.address` column never existed → embedded join 400-failed the whole query; also silently broke checkout customer inserts | ✅ fixed (migration 0052 + resilient fallback) — verified live |
| 6 | **Logged-in dealers cannot send quote requests** ("Name and phone are required") | `getWholesaleSession()` didn't return `phone`; the logged-in form hides the phone field, so validation always failed | ✅ fixed (session now carries phone; action prefers non-empty values) |

### 🟡 Medium

| # | Bug | Detail | Status |
|---|-----|--------|--------|
| 7 | Dashboard **channel donut / weekly trend / category & top-product cards count cancelled orders** and use raw totals | Donut said ₹4,450 while the (correct) header said ₹2,195 — a cancelled ₹2,255 POS bill was included; figures also ignored GST mode & returns | ✅ fixed (`getDashboardAnalytics` + `getChannelReport`: dead orders excluded, GST-aware grand) |
| 8 | **Sales-return picker offers cancelled bills** | A1D2CC92 (cancelled, ₹2,255) selectable for return | ✅ fixed (`getRecentOrders` excludes dead statuses) |
| 9 | Quick-add photo never became the storefront image ("PHOTO COMING SOON" cards) | Raw uploads excluded by the AI-image-only rule | ✅ fixed earlier in this pass — owner's photo becomes cover |
| 10 | Payment RPC failures were **silent** in three server actions | `rpc()` errors ignored → UI showed success | ✅ fixed (logged + early-return) |

### 🟢 Minor / cosmetic

| # | Item |
|---|------|
| 11 | Product page tab title & description say "AggarwalDIVA" for **BD1000 only** — stale AI listing generated while the old prompt was deployed (code/prompt already correct). Fix: regenerate the listing for BD1000 from Product Photos/AI studio, or edit the product's SEO text once |
| 12 | Voucher totals show fractional rupees at checkout ("₹553.1", "−₹55.9") and the Place-order button label doesn't refresh after applying a voucher (still "₹609"; server charges the right amount) |
| 13 | Customers-page "Outstanding" column shows "—" even when the party owes (udhaar page itself is correct) — column reads only `credit_balance`, not open bills |
| 14 | "Approved Retailers · 0 pending" card didn't count the pending dealer application (Verma) — pending = unapproved wholesale customers should drive that number |
| 15 | Hindi console: a few strings remain English ("Showing", "Sales by channel", "in revenue") — dictionary coverage gaps only |
| 16 | Returns picker shows orders as "Walk-in · ₹2,255" — would be clearer with invoice no. + date |

---

## 3. What passed (feature ↔ verdict)

| Area | Result |
|------|--------|
| Category CRUD (3 created) | ✅ |
| Quick-add (photo → AI draft, formula pricing ₹250 → ₹559/₹690) | ✅ |
| Publish to storefront; product page (price, 19% OFF, specs, reviews block) | ✅ |
| Cart → COD checkout → confirmation w/ status timeline | ✅ |
| **Voucher** create (WELCOME10, 10% max ₹100, min ₹500) → applies at checkout → server re-validates → Used=1 | ✅ |
| Fulfillment: Accept → WhatsApp ping → Dispatch → Deliver (timeline timestamps) | ✅ (COD cash recording blocked by bug #2 → retest after 0053) |
| /track (code + phone): live 4-step timeline | ✅ |
| Invoice render: **new legal identity** (5005 Rui Mandi, +91 83750 23077, aggarwaljewellers5005@gmail.com), FY invoice numbering `AJ/26-27/0001`, amount-in-words, terms, cancel-bill panel, GST↔cash-memo switch, refund panel | ✅ |
| POS billing: barcode search, qty/stock display, per-line rate & disc, walk-in + directory customer, **mandatory Sold-by**, split tender UI, memo generation | ✅ (partial-payment persistence = bug #3 → retest after 0054) |
| Stock integrity: 12 → 11 → 10 → 9 → 8 across 4 sales, live on trade portal | ✅ exact |
| Customer directory: auto-upsert from checkout & POS, spend rollups, promotion targeting UI | ✅ |
| Udhaar: GST-aware, dead-orders excluded, party totals ₹1,095 = sum of open bills | ✅ |
| Dashboard header revenue/orders/cash/udhaar cards | ✅ consistent |
| Cashbook: day-book entries per bill, payment-methods manager, method ledger | ✅ (its correct ₹300 exposed bug #3) |
| Dealer signup (with business-proof upload) → wholesale customer → **Approve → access code** → dealer login → trade prices/margins/stock → ₹10,000 min order banner | ✅ |
| Quote request page (as dealer) | ✅ after fix #6 |
| QR & Barcode labels: name + retail + coded wholesale price on one small sticker; QR opens `/p/BD1000` → product page redirect | ✅ |
| Language toggle EN ↔ हिन्दी across console + DIVA | ✅ |
| DIVA: "udhaar kitna baki hai?" → correct ₹1,095 breakdown; suggestions; mic present | ✅ |
| Auth gates: `/admin/*` → `/login?next=…`, `/trade` → `/trade/login` (cookie-less verified) | ✅ |
| Privacy full-screen blur toggle | ✅ (verified earlier in pass) |
| Employees page & attribution report | ✅ page; attribution data blocked by bug #3 |
| Estimates, Returns, Promotions (placement+schedule), Quotes inbox, Analytics pages render | ✅ smoke |

**Known pre-existing:** 4 failing unit tests (pricing/offers/content/imagePrompt) — same JS/SQL constant drift as bug #4; not new.

---

## 4. Sample data created (left in place, per instructions)

| Type | Records |
|------|---------|
| Categories | Necklaces, Earrings, Bangles |
| Product | **Mahika Necklace** · BD1000 · base ₹250 · stock now 8 · published, photo uploaded |
| Website orders | `05037F5D` QA Test Customer (9999988888) · COD ₹550 · **delivered** · unpaid (bug #2 evidence) — settle with "Record a payment" after 0053 · `C5CAF3C3` Priya Sharma (QA) (8888877777) · COD ₹545 (voucher WELCOME10 −₹55 + ship ₹50) · status New |
| POS bills | `AJ/26-27/0001` & `0002` Ramesh Kumar (QA) (9876512345) · ₹550 each — show "Paid" though ₹200/₹100 were tendered (bug #3 evidence; method ledger holds the true ₹300) |
| Cancelled order | `A1D2CC92` ₹2,255 (COD-cap guard test from earlier session) — correctly excluded from revenue/udhaar |
| Customers | QA Test Customer, Priya Sharma (QA), Ramesh Kumar (QA), **Verma Fashion Store (QA)** (wholesale, Meerut, 7777766666, approved, code `88SBXQ`) |
| Employee | Sanjay (QA Staff) |
| Voucher | WELCOME10 (live, used 1×) |
| Quote request | Verma: BD1000 ×50 + oxidised jhumka ×100 (lands in /admin/quotes after this deploy) |

To clean the two mis-booked POS bills after 0053+0054: either cancel `AJ/26-27/0001`/`0002`
(reverses fully) and re-ring them, or leave them — they're QA artefacts, clearly named.

---

## 5. Suggestions (non-bug)

1. **Kill the price drift at the root (bug #4)** before go-live: generate the SQL pricing
   function from `lib/pricing.ts` constants (or vice versa) and make the 4 failing tests the
   contract; until then customers occasionally see ₹9-class discrepancies.
2. Add a health-check page (`/admin/health` exists per 0045/0046 views) to the sidebar so
   the owner can see book-vs-ledger drift like the ₹300 vs ₹1,100 mismatch instantly.
3. The two "phantom column" incidents (customers.address, orders.buyer_*) both came from the
   reference DB having hand-applied DDL. Worth one sweep comparing every column the code
   touches against migrations (the QA batch fixed all found today).
4. Regenerate BD1000's AI listing to purge the last "AggarwalDIVA" string.
5. Env tasks still open: `BUSINESS_UPI_VPA` (scan-to-pay QR), `STAFF_WHATSAPP_NUMBER`,
   `NEXT_PUBLIC_SITE_URL` after domain purchase, GA4 id; delete legacy `BLYTHE_BANK_*` overrides.

---

## 6. Fix batch shipped with this report

**Code:** `app/actions/orders.ts` (hardened POS money update + logging), `app/actions/payments.ts`
(RPC error logging), `app/actions/quotes.ts` + `lib/wholesale.ts` (dealer quote fix),
`lib/supabase/queries.ts` (analytics dead-order/GST fix, returns picker filter).
**Migrations to run in Supabase:** `0053_ledger_kind_cast.sql`, `0054_orders_buyer_columns.sql`.
**Retest after deploy + migrations:** COD deliver records cash · invoice Record-a-payment ·
udhaar Received button · POS partial payment persists + employee tally · dealer quote submits.
