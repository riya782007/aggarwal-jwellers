# Aggarwal Jewellers — Platform Analysis & Delivery Roadmap

_Client: Aggarwal Jewellers — a wholesale (B2B) jewellery house in Sadar Bazar, Delhi.
This document is the engineering plan to turn this repository into the Aggarwal Jewellers
platform: same proven system as the reference build, fully rebranded, B2B-first, with a DIVA
agent that is **more capable** than the reference, and a refreshed UI/UX._

---

## 1. Where we started (repository audit)

This repo (`riya782007/aggarwal-jwellers`) is a **copy of the "Aggarwal Jewellers" build** that was
delivered to another client (`riya782007/yogendra`). A single squashed commit had already done
a partial rebrand of customer-facing copy.

Two important findings from comparing the two repositories:

1. **The reference repo (`yogendra`) is significantly more advanced than this one.** It is a
   strict superset — 203 files vs 188 here — and contains a meaningfully smarter DIVA agent
   plus several modules this repo is missing.
2. **The rebrand here was incomplete** — code, system prompts, the owner passcode, email/domain,
   SKUs and many strings still referenced the old brand.

### What `yogendra` has that this repo was missing

| Area | Reference (`yogendra`) | This repo (before this work) |
|---|---|---|
| **DIVA brain** | Deterministic **multilingual NLU engine** (`lib/diva/nlu.ts`) — English, Hindi & Hinglish; works **with no AI key and no internet** | LLM-only; nothing when keys/network absent |
| **DIVA tools** | ~24 tools incl. `set_price`, `create_product`, stock-by-name, `record_damage`, customer management, catalogue sharing, invoice conversion | 17 basic tools |
| **DIVA proactivity** | `getDivaSuggestions()` — context-aware action chips (out-of-stock, low, pending orders, drafts, dead stock) | none |
| **DIVA UX** | Multi-turn slot-filling, conversational memory ("ye product"), suggestions | single-shot |
| **Pricing** | Per-product price **overrides** (wholesale/retail/MRP) + migration | formula-only |
| **Schema** | Migrations `0002` subcategories, `0003` pricing overrides, `0004` inventory, `0005` RLS lockdown | only `0001` |
| **Components** | `ProductWorkspace`, `ProductStockAdjust`, `PasscodeInput`, `SelectableCatalog` | missing |
| **Tests** | `diva-nlu`, `pricing-overrides`, `stock-kind` suites | missing |

> **Conclusion:** the fastest, safest route to "same system, better" is to bring this repo up to
> the reference's engine level, rebrand it cleanly and completely to Aggarwal Jewellers, and then
> push DIVA **past** the reference with wholesale/B2B superpowers.

---

## 2. Branding decisions

| Item | Decision |
|---|---|
| Brand name | **Aggarwal Jewellers** (standard spelling, customer-facing) |
| AI agent name | **DIVA** — kept (it is the agent, not the brand) |
| Positioning | **Wholesale / B2B first**, with a retail + D2C storefront alongside |
| Location | Sadar Bazar, Delhi (per existing data; owner to confirm exact address/GSTIN) |
| SKU prefix | `AJ####` → **`AJ####`** (Aggarwal Jewellers) |
| Owner passcode | demo passcode rebranded; to be replaced by real auth |
| Email / domain | placeholder `@aggarwaljewellers.in` until the real domain is provided |
| Legal entity / GSTIN / bank | **placeholders** — owner to provide real registration details (drive every invoice) |

Colours, logo and typography are refreshed in the UI/UX pass (PR4).

---

## 3. Delivery plan (sequential PRs)

Each PR is self-contained and is reviewed/merged before the next begins.

### PR1 — Analysis & roadmap _(this document)_
Audit, branding decisions, and the plan below.

### PR2 — Engine upgrade to reference-parity + complete Aggarwal rebrand
- Bring in the smarter DIVA: `lib/diva/nlu.ts` (multilingual), the expanded tool catalogue,
  the NLU-first planner, proactive suggestions, and supporting actions/queries/pricing.
- Add the missing migrations (`0002`–`0005`), components and tests.
- **Complete, consistent rebrand**: brand name, DIVA system prompts, passcode, email/domain,
  legal name, SKU prefix `AJ`, and all storefront/console copy.
- Keep the already-good Aggarwal long-form content (About/Contact/Shipping/FAQ/Size guide).

### PR3 — DIVA beyond the reference: wholesale / B2B superpowers
New intents + tools designed for a lazy-friendly, fast wholesale operation:
- **Bulk stock** ("add 50 each to AJ1004, AJ1006, AJ1010").
- **Rate list / catalogue broadcast** to retailers on WhatsApp, filtered by category.
- **Party / retailer management** — outstanding balance, ledger, mark paid, set credit terms.
- **Outstanding & receivables** queries ("kis party ka kitna baaki hai?").
- **Reorder & dead-stock clearance** prompts surfaced proactively.
- Richer multi-step confirmations and undo.

### PR4 — UI/UX & visual brand refresh (B2B-first)
- New Aggarwal palette, logo lockup and typography.
- Wholesale landing as a first-class entrance (trade pricing, MOQ, rate list, enquiry).
- Polished admin shell, empty states, mobile sticky actions.

### Backlog (post-core, from the existing ROADMAP, prioritised for B2B)
Owner authentication hardening, Razorpay, stock reservation, real OTP delivery, WhatsApp
assistant (Twilio), Delhivery shipping, coupons, fulfilment workflow + notifications,
Vyapar-grade reports (party ledger, GST, day-book), barcode/QR at POS.

---

## 4. Constraints & how correctness is ensured

- **Builds cannot be run in this sandbox** (npm registry is not reachable here). Correctness is
  therefore ensured by (a) porting whole, internally-consistent files from the reference repo,
  which is a real shipped build, and (b) limiting rebrand edits to display strings, never to
  identifiers, imports, CSS classes or DB columns. The client should run `npm install && npm run
  build && npm test` in their environment as the final gate on each PR.
- No live AI/3rd-party call sits on any request path — DIVA's NLU is deterministic and offline,
  so the platform stays fast and demo-safe even without API keys.

---

## 5. The "delight" story for Aggarwal Jewellers

A wholesaler who finds inventory admin tedious gets an assistant they can simply **talk to in
Hindi/Hinglish** — "AJ1004 me 50 maal add karo", "oxidised necklace ka rate list retailers ko
bhejo", "kis party ka kitna baaki hai" — and it just happens, with the books staying correct.
That is the 10× that turns a demo into a signed client.
