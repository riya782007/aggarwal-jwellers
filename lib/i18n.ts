/**
 * lib/i18n.ts — Owner-console language (English / हिन्दी).
 *
 * The console speaks the user's language, chosen per role (Roles page) or via the
 * quick toggle in the sidebar. This module is isomorphic (no server imports) so both
 * server pages and client components can use it. The active language travels in the
 * `bd_lang` cookie — read server-side with getLang() from lib/auth.ts.
 *
 * Adding a page: add keys here, call t(lang, key). Keys missing a Hindi entry fall
 * back to English, so partial coverage is always safe.
 */

export type Lang = "en" | "hi";

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

const STR = {
  // ---- nav: groups ----
  navOverview: { en: "Overview", hi: "अवलोकन" },
  navCatalog: { en: "Catalog", hi: "कैटलॉग" },
  navSales: { en: "Sales & Billing", hi: "बिक्री और बिलिंग" },
  navPeople: { en: "People", hi: "लोग" },
  navGrowth: { en: "Growth", hi: "ग्रोथ" },
  navControl: { en: "Control", hi: "नियंत्रण" },
  navStorefront: { en: "Storefront", hi: "स्टोरफ़्रंट" },
  // ---- nav: links ----
  dashboard: { en: "Dashboard", hi: "होम / डैशबोर्ड" },
  analytics: { en: "Analytics & SEO", hi: "एनालिटिक्स और SEO" },
  addInventory: { en: "Add Inventory", hi: "माल जोड़ें" },
  submissions: { en: "Submissions", hi: "सबमिशन" },
  catalogue: { en: "Catalogue", hi: "कैटलॉग" },
  productPhotos: { en: "Product Photos", hi: "प्रोडक्ट फ़ोटो" },
  categories: { en: "Categories", hi: "श्रेणियाँ" },
  pricingFormula: { en: "Pricing formula", hi: "मूल्य फ़ॉर्मूला" },
  inventory: { en: "Inventory", hi: "स्टॉक (माल)" },
  stockMovement: { en: "Stock Movement", hi: "स्टॉक मूवमेंट" },
  labels: { en: "Labels (QR)", hi: "लेबल (QR)" },
  aiReorder: { en: "AI Reorder", hi: "AI रीऑर्डर" },
  billingPos: { en: "Billing (POS)", hi: "बिलिंग (काउंटर)" },
  salesRecords: { en: "Sales Records", hi: "बिक्री रिकॉर्ड" },
  websiteOrders: { en: "Website Orders", hi: "वेबसाइट ऑर्डर" },
  backorders: { en: "Backorders", hi: "बैकऑर्डर" },
  estimates: { en: "Estimates", hi: "एस्टिमेट" },
  returns: { en: "Returns", hi: "वापसी" },
  purchases: { en: "Purchases", hi: "ख़रीद" },
  bankCash: { en: "Bank & Cash", hi: "बैंक और नकद" },
  customers: { en: "Customers", hi: "ग्राहक" },
  employees: { en: "Employees", hi: "कर्मचारी" },
  udhaar: { en: "Udhaar (Dues)", hi: "उधार / बाकी" },
  suppliers: { en: "Suppliers", hi: "सप्लायर" },
  reviews: { en: "Reviews", hi: "रिव्यू" },
  abandonedCarts: { en: "Abandoned carts", hi: "छूटी हुई कार्ट" },
  notifyMe: { en: "Notify-Me", hi: "नोटिफ़ाई-मी" },
  promotions: { en: "Promotions", hi: "प्रमोशन" },
  vouchers: { en: "Vouchers", hi: "वाउचर / कूपन" },
  quotes: { en: "Quote Requests", hi: "रेट पूछताछ" },
  reels: { en: "Reels", hi: "रील्स" },
  approvals: { en: "Approvals", hi: "मंज़ूरी" },
  notifications: { en: "Notifications", hi: "सूचनाएँ" },
  aiActivity: { en: "AI Activity", hi: "AI गतिविधि" },
  roles: { en: "Roles", hi: "रोल व अनुमतियाँ" },
  retailStore: { en: "Retail store", hi: "रिटेल स्टोर" },
  tradePortal: { en: "Trade Portal", hi: "ट्रेड पोर्टल" },
  shareCatalogue: { en: "Share Catalogue", hi: "कैटलॉग भेजें" },
  signOut: { en: "Sign out", hi: "साइन आउट" },
  language: { en: "Language", hi: "भाषा" },
  // ---- dashboard ----
  ownerConsole: { en: "Owner Console", hi: "मालिक कंसोल" },
  goodMorning: { en: "Good morning", hi: "सुप्रभात" },
  goodAfternoon: { en: "Good afternoon", hi: "नमस्ते" },
  goodEvening: { en: "Good evening", hi: "शुभ संध्या" },
  today: { en: "Today", hi: "आज" },
  thisWeek: { en: "This week", hi: "इस हफ़्ते" },
  thisMonth: { en: "This month", hi: "इस महीने" },
  apply: { en: "Apply", hi: "लागू करें" },
  revenue: { en: "Revenue", hi: "बिक्री (आमदनी)" },
  orders: { en: "Orders", hi: "ऑर्डर" },
  approvedRetailers: { en: "Approved Retailers", hi: "स्वीकृत रिटेलर" },
  pendingApprovals: { en: "Pending Approvals", hi: "बाकी मंज़ूरियाँ" },
  needsOwnerOtp: { en: "needs owner OTP", hi: "मालिक OTP चाहिए" },
  pendingWord: { en: "pending", hi: "बाकी" },
  cashCollected: { en: "Cash collected", hi: "नकद वसूली" },
  counterCash: { en: "counter cash", hi: "काउंटर नकद" },
  bankCollected: { en: "UPI / Bank collected", hi: "UPI / बैंक वसूली" },
  onlineCard: { en: "online & card", hi: "ऑनलाइन और कार्ड" },
  udhaarCard: { en: "Udhaar (Receivable)", hi: "उधार · बाकी" },
  partiesTap: { en: "parties · tap for the list", hi: "पार्टियाँ · सूची देखें" },
  allSettled: { en: "all settled ✓", hi: "सब चुकता ✓" },
  // ---- udhaar / creditors page ----
  udhaarTitle: { en: "Udhaar · Receivables", hi: "उधार · बाकी" },
  udhaarSubtitle: {
    en: "Who owes how much across all bills — mostly wholesale. Receive a payment right here (it settles their oldest bills first), or open a party for the full ledger.",
    hi: "किस पार्टी का कितना बाकी है — सभी बिलों में, ज़्यादातर थोक। यहीं भुगतान दर्ज करें (सबसे पुराने बिल पहले चुकते हैं), या पूरी बही के लिए पार्टी खोलें।",
  },
  totalReceivable: { en: "Total receivable", hi: "कुल बाकी" },
  parties: { en: "Parties", hi: "पार्टियाँ" },
  party: { en: "Party", hi: "पार्टी" },
  openBills: { en: "Open bills", hi: "खुले बिल" },
  outstanding: { en: "Outstanding", hi: "बाकी" },
  receiveCol: { en: "Payment received?", hi: "पैसा आया?" },
  receivedBtn: { en: "✓ Received", hi: "✓ मिल गया" },
  ledgerLink: { en: "Ledger →", hi: "बही →" },
  walkInNote: { en: "Walk-in bills — receive from the invoice page", hi: "वॉक-इन बिल — इनवॉइस पेज से दर्ज करें" },
  noDues: { en: "No outstanding balances — everyone is settled. 🎉", hi: "कोई बाकी नहीं — सबका हिसाब चुकता। 🎉" },
  totalWord: { en: "Total", hi: "कुल" },
  udhaarFootnote: {
    en: 'Payments are allocated oldest-bill-first. If a party pays more than their dues, the surplus stays on their account as an advance. DIVA understands this too — try "Sharma ne 5000 diye".',
    hi: 'भुगतान सबसे पुराने बिल पर पहले लगता है। बाकी से ज़्यादा देने पर अतिरिक्त राशि एडवांस के रूप में खाते में रहती है। DIVA भी समझती है — "शर्मा ने 5000 दिए" बोलकर देखें।',
  },
  // ---- quick add (photo-first stock entry) ----
  qaTab: { en: "⚡ Quick add (photo-first)", hi: "⚡ फटाफट जोड़ें (फ़ोटो से)" },
  qaIntro: {
    en: "Photo → category → cost → quantity. Done. The AI writes the name & description from the photo, the SKU is automatic and prices come from your formula — it lands as a draft for you to publish.",
    hi: "फ़ोटो → श्रेणी → लागत → कितने पीस। बस। AI फ़ोटो देखकर नाम-विवरण लिखता है, SKU अपने-आप बनता है और दाम आपके फ़ॉर्मूले से — ड्राफ़्ट में जुड़ता है, आप पब्लिश करें।",
  },
  qaPhoto: { en: "1 · Photo of the piece", hi: "1 · माल की फ़ोटो" },
  qaTakePhoto: { en: "Tap to take / choose a photo", hi: "फ़ोटो खींचें या चुनें" },
  qaCategory: { en: "2 · Category", hi: "2 · श्रेणी" },
  qaSelectCategory: { en: "Choose category…", hi: "श्रेणी चुनें…" },
  qaCost: { en: "3 · Cost / base price ₹", hi: "3 · लागत / बेस दाम ₹" },
  qaQty: { en: "4 · Quantity", hi: "4 · कितने पीस" },
  qaVoiceTitle: { en: "Speak the details", hi: "बोलकर भरें" },
  qaVoiceListening: { en: "Listening… speak now", hi: "सुन रही हूँ… बोलिए" },
  qaVoiceHint: { en: "e.g. \"gold jhumka, 50 pieces, cost 80\" — fills the form for you", hi: "जैसे \"गोल्ड झुमका, 50 पीस, लागत 80\" — फ़ॉर्म अपने-आप भर जाएगा" },
  qaSku: { en: "Your code (optional)", hi: "आपका कोड (वैकल्पिक)" },
  qaSkuHint: { en: "blank = auto AJ####", hi: "खाली = अपने-आप AJ####" },
  qaUnit: { en: "Counted as", hi: "गिनती कैसे" },
  unitPc: { en: "Piece", hi: "पीस" },
  unitPair: { en: "Pair", hi: "जोड़ी" },
  unitSet: { en: "Set", hi: "सेट" },
  unitDozen: { en: "Dozen", hi: "दर्जन" },
  qaSave: { en: "✓ Add to stock", hi: "✓ माल जोड़ें" },
  qaSaving: { en: "Adding… the AI is writing the listing from your photo", hi: "जोड़ रही हूँ… AI फ़ोटो से लिस्टिंग लिख रहा है" },
  qaDone: { en: "Added as a draft ✓", hi: "ड्राफ़्ट में जुड़ गया ✓" },
  qaDoneNote: { en: "Name, description, SKU and prices were drafted automatically — review & publish from the Catalogue.", hi: "नाम, विवरण, SKU और दाम अपने-आप बन गए — कैटलॉग से देखकर पब्लिश करें।" },
  qaNext: { en: "+ Add next piece", hi: "+ अगला माल जोड़ें" },
  qaOpen: { en: "Open in Catalogue →", hi: "कैटलॉग में देखें →" },
  // ---- privacy shield ----
  privacyHide: { en: "Hide screen", hi: "स्क्रीन छिपाएँ" },
  privacyShow: { en: "Show screen", hi: "स्क्रीन दिखाएँ" },
  privacyHiddenMsg: { en: "Screen hidden for privacy", hi: "गोपनीयता के लिए स्क्रीन छिपी है" },
  cashWord: { en: "Cash", hi: "नकद" },
  upiWord: { en: "UPI", hi: "UPI" },
  bankWord: { en: "Bank", hi: "बैंक" },
} as const;

export type I18nKey = keyof typeof STR;

/** Translate a key. Unknown keys and missing Hindi entries fall back safely. */
export function t(lang: Lang, key: I18nKey): string {
  const e = STR[key] as { en: string; hi?: string } | undefined;
  if (!e) return key;
  return (lang === "hi" ? e.hi : undefined) ?? e.en;
}
