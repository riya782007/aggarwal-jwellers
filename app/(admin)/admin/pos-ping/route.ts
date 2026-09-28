export const dynamic = "force-dynamic";
import { getPosStock } from "@/lib/supabase/queries";

/** Lightweight keepalive for the counter. Middleware on /admin/* slides the session cookie
 *  (and bounces anyone not signed in to /login, so stock is never served to the public).
 *
 *  `?stock=1` (sent by the Billing screen only) also returns live per-SKU stock counts, so the
 *  open POS stops showing the quantities it loaded hours ago. It rides on the ping that already
 *  runs every 2 minutes — no extra function invocations on Netlify. */
export async function GET(req: Request) {
  const wantsStock = new URL(req.url).searchParams.get("stock") === "1";
  if (!wantsStock) {
    return new Response("ok", {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  let stock: Record<string, number> | null = null;
  try {
    stock = await getPosStock();
  } catch (err) {
    console.error("pos-ping stock read failed:", err);
  }
  // A failed read still answers 200 so the keepalive keeps sliding the session; the POS
  // simply keeps the numbers it has.
  return new Response(JSON.stringify({ ok: true, stock }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
