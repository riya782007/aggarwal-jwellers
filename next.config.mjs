/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow larger product photos through server actions (images are compressed
    // client-side first, but this is a safety net so uploads never stall).
    serverActions: { bodySizeLimit: "12mb" },
    // Enable instrumentation.ts (Next 14) — used to force IST server timezone.
    instrumentationHook: true,
  },
};
export default nextConfig;
