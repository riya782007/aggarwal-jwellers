# Aggarwal Jewellers — Android app

The app is a thin Android shell (Capacitor 8) that opens the **live console** at
`https://aggarwaljeweller.in/admin` and adds what a browser can't do:

- **Bluetooth sticker printing.** Every "Print labels" button sends the stickers straight to the paired label printer, using TSPL with the same QR, SKU, price code and box line as the PDF. It supports both Classic Bluetooth (SPP) and BLE printers.
- **Android print screen for A4 bills.** `window.print()` opens Android printing, including Save as PDF.
- **Camera** for QR scanning at billing and for product photos.
- **Offline screen** with a Retry button when there is no internet.

Because it loads the live site, **website updates reach every phone instantly. A new APK is only needed when files in `mobile/` change.**

On a normal browser nothing changes: the website keeps its PDF printing.

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

## Staging (test without touching the live shop)

Run the workflow with `server_url` set to a Netlify Deploy Preview, for example
`https://deploy-preview-50--<site>.netlify.app/admin`, and untick "publish release".
Install that APK on a test phone only. Before testing billing there, point the Deploy Preview's Supabase env vars at a staging project, so test bills never reach the live database.

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
