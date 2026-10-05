# Internal mobile app

## Existing work inspected

Baseline: d42b28a (main). Existing manifest starts at /admin with standalone display, regular and maskable icons. Root layout already supplies Apple home-screen metadata; Next supplies the default responsive viewport. AdminNav already has a phone drawer and desktop sidebar. The merged Android wrapper adds Bluetooth label printing, native A4 printing, camera access and a bundled offline notice. No web service worker or install prompt existed. These are repository findings; commit authorship does not establish which assistant produced every feature.

## This change

Adds an install offer inside the authenticated console, Safari installation guidance, and an offline notice. Android native builds retain their existing bridge and skip PWA registration. Enlarges mobile menu buttons to 44px and limits drawer width on small phones.

The worker registers only after opening the authenticated console in a production HTTPS build. Its root scope includes /login so an expired session can reconnect; interception is restricted to GET document navigations at /admin and /login. Only the public static offline notice is cached. No HTML business screens, customer records, API responses, Supabase calls, server actions or writes are cached or queued. Retail navigations pass through untouched. Activation does not force a reload or take over active billing screens.

This supports installation and an offline fallback, **not offline billing**. A connection is required for live operations. Browser online status is advisory; failed requests still follow existing application error handling. If saving loses its response, inspect the saved list before retrying.

## Database and deployment

No migration is needed: installation and the offline notice use browser facilities, not device tokens or new session tables. No changes to Supabase clients, authentication, schema, middleware or netlify.toml. No SQL should be run for this change. Device visit SQL already under docs is unrelated and must not be applied as part of installing the app.

Keep changes on this review branch until staging checks pass. Production remains on main. Configure a Netlify Deploy Preview with staging Supabase credentials before creating any test bill. Existing production environment variables and build command stay as configured.

## Installation and acceptance checks

1. Open the HTTPS preview /admin on Android Chrome, sign in, and use Install staff app when offered (browser menu Install/Add to Home Screen is also available). Open the resulting icon and verify it starts at /admin and retains normal role restrictions.
2. On iPhone Safari open /admin, sign in, Share → Add to Home Screen. Verify standalone launch. Test tablets in portrait and landscape.
3. Verify manifest icons, start URL, and standalone display in browser developer tools. After first registration, reload once online before testing offline because the worker intentionally avoids taking over the current page.
4. Disconnect and navigate/reload /admin: see the static offline notice. Retry after reconnecting. In Cache Storage confirm only internal-offline.html exists; no stock, bills or customer data. Offline POST requests must fail normally, never queue.
5. On staging, test billing, estimate, QR camera scan, permission restrictions, logout/login and session expiry at 360px and tablet widths. Confirm desktop billing and retail screens retain their normal behavior. Test native printing separately in the existing APK.
6. After another deployment, keep a bill open and confirm it is not forcibly reloaded. Close app windows and reopen to allow the new worker to activate.

## Rollback

Before reverting a released worker, publish a replacement at /internal-sw.js that deletes only caches beginning aggarwal-offline- and calls self.registration.unregister() during activation. Keep that endpoint available long enough for installed clients to reconnect. Do not clear unrelated caches or browser session cookies. Removing registration code alone does not unregister already installed workers.
