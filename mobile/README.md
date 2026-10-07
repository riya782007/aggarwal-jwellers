# Aggarwal Jewellers — Android app (internal, not on the Play Store)

The app is a thin Android shell (Capacitor 8) that opens the **live console** at
`https://aggarwaljeweller.in/admin`. **Every feature of the current software is in it automatically**:
billing / POS with scanning, Final Estimates (including **Edit items**), stock, catalogue and photos,
labels, purchases, customers, reports and the A4 print fix. They are the same pages, and every website
update reaches the app instantly. It adds what a browser on a phone can't do:

- **Bluetooth sticker printing.** Every "Print labels" button prints straight to the paired label printer, using TSPL with the same QR, SKU, price code and box line as the PDF. It works with Classic Bluetooth (SPP) and BLE printers, and is set up once on the **Label Printer** screen.
- **A4 bills.** "Download / Print PDF" opens Android's print screen (any Wi-Fi printer, or Save as PDF → share).
- **Exports and downloads.** Excel/CSV exports, label PDFs and templates are saved to **Downloads/Aggarwal**, and the share sheet opens (WhatsApp, Drive, Files…).
- **WhatsApp buttons** open the WhatsApp app.
- **Camera** for QR scanning at billing and for product photos. **Bluetooth barcode scanners** pair as a keyboard and work like at the counter.
- **Back button** goes to the previous page. On the first page it only minimises the app, so a bill in progress is never lost.
- **Stays logged in** across app switches (same 1-hour idle rule as the website).
- **No-internet screen** with Retry; bills are always safe on the server.

On a normal browser nothing changes: the website keeps its PDF printing and normal downloads.

## One-time setup (5 minutes)

Add these four repository secrets on GitHub (Settings → Secrets and variables → Actions → New repository secret), using the values in the `android-signing-secrets.txt` file handed over with this change:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the long base64 block |
| `ANDROID_KEYSTORE_PASSWORD` | the password |
| `ANDROID_KEY_ALIAS` | `aggarwal` |
| `ANDROID_KEY_PASSWORD` | the password (same as above) |

Keep `aggarwal-release.jks` and its password safe, outside the repo. Every future update must be signed with this same key, or phones will refuse to update.

Without the secrets, CI still builds a debug APK that installs fine, but it can't be updated in place.

## Build and release the APK

GitHub → **Actions** → **Android app** → **Run workflow** (leave the defaults) → about 6 minutes.
The APK appears under **Releases** as `aggarwal-jewellers.apk`.

## Install on a shop phone

1. On the phone, open the repo's latest Release and tap `aggarwal-jewellers.apk`.
2. Allow "Install unknown apps" for the browser, once.
3. Open **Aggarwal Jewellers** and log in with the usual passcode.
4. The first time someone taps **Print labels**, the app opens **Label Printer** setup. Pick the printer, and a test sticker prints. Done.

## Test before going live

Pull requests use `[skip netlify]`, so no Netlify credits are spent on previews. The safe order is:

1. Merge the PR (no build). Then in Netlify, **Trigger deploy → Deploy project** (one build) and **Publish**.
   The website changes are app-only: on a browser nothing changes (`tests/website-unchanged.test.ts`).
2. GitHub → **Actions → Android app → Run workflow** (defaults) → install the APK from **Releases** on
   **your own phone** first, and try billing, Edit items, labels and printing.
3. When it's good, install it on the shop phones.

For a staging check, run the workflow with `server_url` = a Deploy Preview `/admin` URL and untick
"publish release". That builds a separate **"Aggarwal TEST"** app that installs beside the real one. A preview
uses the live database, so don't save real test bills on it.

## Develop locally (optional)

```bash
cd mobile
npm ci
npx cap sync android
npx cap open android   # Android Studio
```

## Files

- `capacitor.config.ts` — the app ID, the URL the app opens, and allowed hosts.
- `android/app/src/main/java/in/aggarwaljeweller/counter/AjPrinterPlugin.java` — Bluetooth printing and the print screen.
- `www/offline.html` — the "No internet" screen.
- Website side: `lib/nativeBridge.ts`, `lib/tspl.ts`, `components/admin/PrinterSettings.tsx`, `components/admin/NativeAppBridge.tsx`.
