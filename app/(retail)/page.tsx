// The storefront now lives at the site root ("/"). This renders the shared shop index inside the
// (retail) layout — so the bare domain (aggarwaljeweller.in) shows the full shop with its header,
// nav and cart. /shop still resolves (all existing links keep working) but points its canonical
// here, so search engines treat "/" as the one true home (no duplicate-content penalty).
//
// IMPORTANT: this route renders the SHARED <ShopIndex /> component — it does NOT import
// "./shop/page". One route importing another route's page module trips a Next 14 build bug
// (ENOENT page_client-reference-manifest.js for "(retail)/page"). Sharing a plain component
// gives each route its own client-reference manifest and builds cleanly.
import { ShopIndex } from "./shop/ShopIndex";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Premium Artificial Jewellery — Kundan, Meena, Temple",
  description:
    "Shop bridal, AD, anti-tarnish & daily-wear jewellery from Aggarwal Jewellers, Sadar Bazar Delhi. Necklaces, earrings, bangles, anklets & rings with COD and free shipping over ₹999.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  return <ShopIndex />;
}
