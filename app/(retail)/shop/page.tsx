export const dynamic = "force-dynamic";
import { ShopIndex } from "./ShopIndex";

export const metadata = {
  title: "Premium Artificial Jewellery — Kundan, Meena, Temple",
  description: "Shop bridal, AD, anti-tarnish & daily-wear jewellery from Aggarwal Jewellers, Sadar Bazar Delhi. Necklaces, earrings, bangles, anklets & rings with COD and free shipping over ₹999.",
  // The store's canonical home is the site root ("/"); /shop still resolves for existing links.
  alternates: { canonical: "/" },
};

export default async function Shop() {
  return <ShopIndex />;
}
