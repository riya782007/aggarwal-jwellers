// The storefront now lives at the site root ("/"). This renders the shop index inside the
// (retail) layout — so the bare domain (aggarwaljeweller.in) shows the full shop with its header,
// nav and cart. /shop still resolves (all existing links keep working) but points its canonical
// here, so search engines treat "/" as the one true home (no duplicate-content penalty).
//
// `dynamic` is declared directly (not re-exported) so Next's route-config analyzer always sees it.
import Shop from "./shop/page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Premium Artificial Jewellery — Kundan, Meena, Temple",
  description:
    "Shop bridal, AD, anti-tarnish & daily-wear jewellery from Aggarwal Jewellers, Sadar Bazar Delhi. Necklaces, earrings, bangles, anklets & rings with COD and free shipping over ₹999.",
  alternates: { canonical: "/" },
};

export default Shop;
