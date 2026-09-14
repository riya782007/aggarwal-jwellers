import type { MetadataRoute } from "next";
// Set NEXT_PUBLIC_SITE_URL in Netlify to the brand domain (https://aggarwaljewellers.in).
// Fallback = the production site, never a per-deploy preview URL.
const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://aggarwaljewellers.in").replace(/\/$/, "");
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      // Dealer portal + admin + transactional pages must never be crawled or indexed.
      disallow: ["/admin", "/checkout", "/order", "/trade", "/partner", "/dealer", "/wholesale"],
    }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
