# Client Questionnaire → Feature & Change List (15 Jul 2026)

_Source: "Aggarwal Jewellers — Getting Started Questionnaire" (Google Forms responses).
Deadline signal (Q37): **ready by mid-August**. Multiple-choice answers (Q13, 18, 20, 25, 28,
31, 36) don't show the ticked option in the PDF export — confirm those with the client._

## 🔴 A. CRITICAL — legal/billing identity is wrong in the app (fix before any real bill)

`lib/business.ts` still carries the previous client's registration. Every GST invoice printed
today shows another firm's GSTIN and bank account.

| Field | In the app today | Client's answer (Q1–8) |
|---|---|---|
| Address | 5150-B, Rui Mandi | **5005, Rui Mandi, Sadar Bazar, Delhi-110006** |
| Phone | +91 98731 51767 | **8375023077** |
| Email | hello@aggarwaldiva.in | **aggarwaljewellers5005@gmail.com** |
| GSTIN | 07AAIPJ3244P1ZD | **07AAMFA0395E1ZK** |
| PAN | AAIPJ3244P | **AAMFA0395E** |
| Legal name | Aggarwal Jewellers (India) | **Aggarwal Jewellers** |
| Bank | Kotak 9868104364 / KKBK0000208 | **ICICI · Aggarwal Jewellers · 629505040579 · ICIC0006295** |
| TIN | legacy value | drop (GST era) |

Also: hardcoded `wa.me/919873151767` links (trade login etc.) must move to the business
constant, and DIVA/listing-agent prompts still say "AggarwalDIVA … blythediva voice" — retune
copy to "bridal, AD, anti-tarnish & daily-wear jewellery" (Q2).

## 🟠 B. Feature gaps to BUILD (client asked, not in the app yet)

1. **Keep the owner's own item codes** (Q21 "We keep codes"): Quick-add (photo-first) has no
   code field — add an optional "Your code" input (auto-code only as fallback); change the
   auto prefix BD#### → AJ####; bulk import already accepts a sku column ✓.
2. **Units of measure** (Q22): piece (default), **pair / set for bangles, dozen for a few** —
   `products.unit` column, shown on bills, labels, catalogue and POS ("2 set", "1 dozen").
3. **Voice-filled stock entry** (Q20-b, Q34): photo + SPEAK the details ("gold jhumka, 50
   pieces, cost 80") → fills category/cost/qty. Hindi + English speech-to-text on the Quick-add
   tab and the DIVA bubble. (The photo-first flow itself is ✅ live.)
4. **AI colour conversion** (Q24): "convert 1 image's colour to another" — recolour a product
   photo into each colourway from one shot (extends the existing media/AI studio).
5. **QR label v2** (Q26–27): small white sticker with **name + 2 prices** and the **QR opening
   the product page** — switch QR payload from bare SKU to the product URL, default "show
   name" ON, keep the coded wholesale price scheme; POS scanner must accept a scanned URL
   and extract the SKU so counter billing keeps working.
6. **WhatsApp rate-list broadcast by category, one command** (Q30): "oxidised necklace ka rate
   list retailers ko bhejo" — DIVA command + share-catalogue link generation per category to
   approved parties. (Last remaining item from the original simple-console plan.)
7. **Order alerts to STAFF** (Q12): new-order WhatsApp should go to a configurable staff
   number (env/setting), not only the owner.

## 🟡 C. Configuration / content tasks (no code, or one-liners)

8. Wholesale minimum order → **₹10,000** (Q29; setting exists on /admin/pricing — change value).
9. Domain: buy **aggarwaljewellers.com** (fallback navkrishajewels.com), point Vercel +
   `NEXT_PUBLIC_SITE_URL`; business WhatsApp = **+91 11 4004 7222** (Q11).
10. Razorpay account on the ICICI account; UPI VPA into `BUSINESS_UPI_VPA` (scan-to-pay QR
    is already live once set); GA4 id if wanted.
11. **Logo to design** (Q5 "Please make") — client leaves it to us; propose gold/maroon
    lockup; favicon + invoice header + storefront.
12. Storefront copy: tagline "Bridal, AD, Anti-Tarnish & Daily-wear jewellery" (Q2), About/
    Contact with the real address/phone/email; **pricing formula numbers** (Q14–18) and
    **bill terms** (Q9), **return policy** (Q33) — client said "will discuss/sending photo":
    collect at the sit-down.
13. Rounding preference (Q18) not visible in export — confirm (₹10/50/100) and set the
    formula's `round_to`.

## ✅ D. Already covered by what we've shipped

Photo-first quick add (Q19–20a) · QR labels exist (payload change pending, §B5) · approved-only
wholesale visibility (Q28) · udhaar/party credit tracking (Q29) · COD + online payment with COD
cap (Q31) · courier shipping booked on bills (Q32) · Hindi/English console + DIVA understands
both (Q34) · order accept/reject with WhatsApp + customer tracking page.

## Suggested build order (to hit mid-August)

1. **A — identity fix** (same day; blocks real billing)
2. B1 + B2 (own codes + units — data model touches, do early)
3. B5 (QR label v2 + POS URL scan)
4. B6 (rate-list broadcast) and B7 (staff alerts)
5. B3 (voice input) then B4 (AI recolour)
6. C-items in parallel as the client supplies documents/answers.
