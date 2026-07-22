import { redirect } from "next/navigation";

// The public root is the storefront. Anyone typing the bare domain lands straight in the shop —
// no "choose your door" menu, and no owner-console link exposed to shoppers. The owner reaches
// the console directly at /admin (auth-gated); dealers at /trade.
export default function Home() {
  redirect("/shop");
}
