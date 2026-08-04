export const dynamic = "force-dynamic";
import { ShopIndex } from "./ShopIndex";

export const metadata = {
  title: "Premium Artificial Jewellery — Kundan, Meena, Temple",
  description: "Shop bridal, AD, anti-tarnish & daily-wear jewellery from Aggarwal Jewellers, Sadar Bazar Delhi. Necklaces, earrings, bangles, anklets & rings with COD and free shipping over ₹999.",
  // The bare domain ("/") redirects here, so /shop is the canonical storefront home.
  alternates: { canonical: "/shop" },
};

export default async function Shop() {
  return <ShopIndex />;
}
