import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The app loads the LIVE console, so every website fix reaches phones instantly and there is
 * only one system. Staging builds point at a Netlify Deploy Preview instead:
 *   CAP_SERVER_URL=https://deploy-preview-123--<site>.netlify.app/admin npx cap sync android
 */
const serverUrl = process.env.CAP_SERVER_URL || "https://aggarwaljeweller.in/admin";
const host = new URL(serverUrl).hostname;

const config: CapacitorConfig = {
  appId: "in.aggarwaljeweller.counter",
  appName: "Aggarwal Jewellers",
  webDir: "www",
  server: {
    url: serverUrl,
    // Shown when the site can't be reached (no internet) — has a Retry button.
    errorPath: "offline.html",
    allowNavigation: [host, "aggarwaljeweller.in", "*.aggarwaljeweller.in", "*.netlify.app"],
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#451117",
    allowMixedContent: false,
  },
};

export default config;
