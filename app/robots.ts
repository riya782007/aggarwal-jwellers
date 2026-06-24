import type { MetadataRoute } from "next";
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aggarwal-jewellers.vercel.app";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/checkout", "/order"] }], sitemap: `${BASE}/sitemap.xml` };
}
