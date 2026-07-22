/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 * Forces the server timezone to India Standard Time so every server-rendered date/time
 * (orders, invoices, dashboards, ledgers…) shows in IST instead of UTC. We do this in code
 * because Vercel reserves the `TZ` environment variable, so it can't be set from the dashboard.
 * Node on Linux honours a runtime change to process.env.TZ for all subsequent Date operations.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "Asia/Kolkata";
  }
}
