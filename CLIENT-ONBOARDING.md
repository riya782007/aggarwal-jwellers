# Aggarwal Jewellers — Onboarding & Credentials Checklist

_What to collect from the owner to take the platform live._

This is the single list of everything we need from **Aggarwal Jewellers** to configure,
brand, and launch the platform (storefront + wholesale + admin console + the DIVA agent).

**Legend**
- 🔴 **Required now** — the app/admin won't run or invoices will be wrong without it.
- 🟡 **Recommended** — needed to unlock a major feature (WhatsApp, payments, shipping, analytics).
- 🟢 **Later** — nice-to-have / future phase.

> ⚠️ **Security:** secrets (service keys, API tokens, passwords) should be shared over a
> secure channel — **not** WhatsApp/email screenshots. A password manager share, or a
> one-time secret link, is ideal. We store them only in server environment variables,
> never in the code or the browser.

---

## A. Business & legal details — for GST invoices, cash memos & estimates  🔴

These drive every Tax Invoice, Cash Memo and Quotation. They live in one file
(`lib/business.ts`) and flow everywhere automatically. Get these exactly as registered.

| # | What to ask for | Why we need it | Example / format |
|---|---|---|---|
| A1 | **Registered (legal) business name** | Printed on every tax invoice | "Aggarwal Jewellers" / "M/s Aggarwal Jewellers" |
| A2 | **Trade / brand name** | Shown across the storefront & app | "Aggarwal Jewellers" |
| A3 | **Full shop address** + PIN | Invoice header, SEO, "Visit us" | Sadar Bazar, Rui Mandi, Delhi 110006 |
| A4 | **State + GST state code** | Decides CGST/SGST vs IGST split | Delhi = `07` |
| A5 | **GSTIN** | Mandatory on GST invoices | `07ABCDE1234F1Z5` |
| A6 | **PAN** | Tax compliance / invoices | `ABCDE1234F` |
| A7 | **Business phone (WhatsApp)** | "WhatsApp orders" buttons, invoice | `+91 9XXXXXXXXX` |
| A8 | **Business email** | Invoice footer, contact, notifications | `hello@aggarwaljewellers.in` |
| A9 | **Bank details** — account name, A/C no., IFSC, branch | Printed on invoices for payment | HDFC / 5020… / HDFC0000123 |
| A10 | **Invoice terms & conditions** | Footer of bills (return/interest/jurisdiction) | up to ~3 lines |
| A11 | **GST rate & HSN confirmation** | We've set **3% / HSN 7117** (imitation jewellery). Confirm — **real gold/diamond is different (e.g. 3% gold but different HSN; making charges 5%)** | confirm product mix |
| A12 | **Logo files** (PNG/SVG, light + dark) + brand colours if any | Header, invoices, favicon, social | high-res transparent PNG |

---

## B. Core platform infrastructure — to run at all  🔴

The app is **Next.js + Supabase**, deployed on **Vercel**. Two decisions: *who owns the
Supabase project* and *what domain we use*.

| # | What to ask for | Why we need it | Notes |
|---|---|---|---|
| B1 | **Supabase project ownership** — either (a) we provision it under our agency account, or (b) the owner creates a Supabase account and adds us | The database that stores products, orders, customers, stock | Recommended: we provision, hand over later |
| B2 | `NEXT_PUBLIC_SUPABASE_URL` | Public API endpoint of the DB | `https://xxxx.supabase.co` |
| B3 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key (safe for browser) | from Supabase → Settings → API |
| B4 | `SUPABASE_SERVICE_ROLE_KEY` 🔴🔒 | Server-only key the admin console uses to read protected tables | **secret** — server env only |
| B5 | **Custom domain** + DNS access (or registrar login) | e.g. `aggarwaljewellers.in` / `shop.…` | needed to point the domain at Vercel |
| B6 | **Vercel/hosting account** decision | Where the site runs | we can host under our account |
| B7 | `NEXT_PUBLIC_SITE_URL` | Canonical URL for SEO, sitemap, share links | set to the final domain |

> If we provision Supabase + Vercel ourselves, the owner only needs to provide the **domain**
> (B5) — we generate B2–B4 and B7.

---

## C. Security & access — owner chooses the values  🔴

These protect the admin console. For the demo they default to known values — **they must be
changed for production.**

| # | Variable | What it is | Action |
|---|---|---|---|
| C1 | `OWNER_PASSCODE` | The owner's login passcode to the admin console | owner picks a strong passcode (demo default: `aggarwal2026`) |
| C2 | `OWNER_OTP` | OTP that authorises sensitive approvals (e.g. price changes) | owner picks (demo default: `482913`); later replaced by real OTP delivery |
| C3 | `ADMIN_SESSION_TOKEN` 🔒 | Secret that signs admin sessions | we generate a long random string (demo default must be overridden) |
| C4 | **Staff list & roles** | Names + which staff can do what (billing, stock, etc.) | owner provides staff names; we issue per-staff passcodes on the Roles page |

---

## D. WhatsApp & messaging — to automate customer/retailer messages  🟡

Today the app uses **click-to-chat** WhatsApp links (no API key needed) for share/nudge
buttons. To send **automated** WhatsApp (order updates, OTPs, rate-list broadcasts), we need
the WhatsApp Business API.

| # | What to ask for | Why | Notes |
|---|---|---|---|
| D1 | **Owner's WhatsApp Business number** | Powers all the existing click-to-chat buttons | works immediately, no API key |
| D2 | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` 🔒 (or Meta WhatsApp Cloud API creds) | Automated WhatsApp/SMS sending | requires a verified WhatsApp Business sender |
| D3 | **Approved WhatsApp sender number / template approval** | Meta requires pre-approved message templates | we help set up |

---

## E. Online payments — for D2C / online orders  🟡

Needed when customers pay online on the storefront (B2B can stay on credit/bank transfer).

| # | What to ask for | Why | Notes |
|---|---|---|---|
| E1 | **Razorpay (or PayU/Cashfree) account** | Collect card/UPI/netbanking payments | gateway under owner's name for settlements to their bank |
| E2 | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` 🔒 | API keys to create/verify payments | from the gateway dashboard |
| E3 | **Settlement bank account** (same as A9) | Where money lands | KYC done with the gateway |

_(Payment wiring is a planned phase; collecting these early avoids a delay later.)_

---

## F. Shipping & logistics — to ship D2C orders  🟢

| # | What to ask for | Why | Notes |
|---|---|---|---|
| F1 | **Delhivery (or Shiprocket) account** | Generate labels & track shipments | owner's logistics account |
| F2 | `DELHIVERY_API_TOKEN` 🔒 | API access for rates/labels/tracking | from the courier dashboard |
| F3 | **Pickup / warehouse address & contact** | Where couriers collect from | usually the Sadar Bazar shop |

---

## G. AI providers — to power DIVA's smartest features & content  🟡

**Important:** DIVA already understands English/Hindi/Hinglish and runs your inventory
**without any AI key** (its core engine is deterministic and offline). API keys are only
needed to unlock the *extra* AI features: free-text fallback understanding, auto-writing
product descriptions, and AI image/photo generation.

| # | What to ask for | Why | Notes |
|---|---|---|---|
| G1 | `GROQ_API_KEY` and/or `OPENAI_API_KEY` 🔒 | LLM "fallback brain" + content generation | either works; Groq is fast/cheap, OpenAI is broad |
| G2 | `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL`) / `GEMINI_API_KEY` 🔒 | Product image / photo generation | optional |
| G3 | `AI_BUDGET_PAISE` | A hard monthly spend cap on AI so costs never surprise you | e.g. `500000` = ₹5,000 |

> Recommendation: start with **one** key (Groq or OpenAI). Everything still works without
> these — you simply won't get the AI-written copy and the free-text fallback.

---

## H. Analytics & marketing — measure and grow  🟢

| # | What to ask for | Why | Notes |
|---|---|---|---|
| H1 | `NEXT_PUBLIC_GA4_ID` | Google Analytics 4 traffic/sales tracking | `G-XXXXXXX` |
| H2 | `NEXT_PUBLIC_GA4_PROPERTY_ID` + `GA4_API_SECRET` 🔒 | Deep-link reports & server-side conversions | from GA4 admin |
| H3 | **Instagram handle / Google Business Profile** | Reels/links, local SEO, reviews | e.g. `@aggarwaljewellers__` |

---

## I. Catalogue & operational data — the content that fills the system  🔴 (for go-live)

Not "credentials", but essential to launch with real data instead of demo data.

| # | What to collect | Used for |
|---|---|---|
| I1 | **Product list**: design name, category/sub-category, **wholesale price**, MRP, opening **stock qty**, (optional manual SKU) | Catalogue, inventory, pricing — SKUs auto-generate as `AJ####` |
| I2 | **Product photos** (per design; multiple angles ideal) | Storefront & catalogue |
| I3 | **Retailer / party list**: shop name, city, phone, GSTIN, credit terms | Wholesale accounts & trade pricing |
| I4 | **Category / sub-category structure** | Navigation & filtering |
| I5 | **Opening balances / past dues** (if migrating books) | Ledger accuracy |

---

## Quick "minimum to switch on" summary

To get a **working, branded, real-data** instance live, the absolute minimum is:
1. **Section A** — full business & GST details + logo (🔴)
2. **Section B** — Supabase keys (or let us provision) + the domain (🔴)
3. **Section C** — owner passcode + OTP + staff list (🔴)
4. **Section I** — product list + photos + retailer list (🔴 for go-live)

Then layer on, in order of impact: **D (WhatsApp automation) → E (payments) → G (AI) →
F (shipping) → H (analytics).**

---

### How to hand this back to us
- Fill business details (A) and choose security values (C) in a shared doc.
- Share secrets (B4, D2, E2, F2, G1–G2, H2) via a password manager or one-time secret link.
- Send the catalogue (I) as a spreadsheet + a photos folder.

We plug these into the server's environment variables and the one business-profile file,
run the build, and the whole platform — storefront, wholesale, invoices and DIVA — comes up
fully branded for Aggarwal Jewellers.
