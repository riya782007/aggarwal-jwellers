/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow larger product photos through server actions (images are compressed
    // client-side first, but this is a safety net so uploads never stall).
    serverActions: { bodySizeLimit: "12mb" },
    // Enable instrumentation.ts (Next 14) — used to force IST server timezone.
    instrumentationHook: true,
    // LIVE UI: disable Next's client-side Router Cache so navigating back to a page NEVER
    // shows a stale copy. Without this, Next reuses a cached render for ~30s after a change,
    // forcing a manual refresh to see edits (stock, prices, SKUs, orders). 0 = always refetch
    // the server component on navigation. Every admin page is force-dynamic anyway, so this
    // just guarantees the screen always shows live data.
    staleTimes: { dynamic: 0, static: 0 },
  },
};
export default nextConfig;
