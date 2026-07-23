import { permanentRedirect } from "next/navigation";

// /wholesale lands on the open trade catalogue (no login wall — browsing is public; identity is
// captured at checkout). Unlinked from the storefront and blocked in robots.
export const metadata = { robots: { index: false, follow: false } };

export default function LegacyWholesale() {
  permanentRedirect("/trade");
}
