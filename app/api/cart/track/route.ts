import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Real abandoned-cart tracking (0049): the storefront cart pings this route (debounced)
 *  while the customer shops. Upserts by a stable browser cart key; a completed checkout
 *  marks the cart recovered; an emptied cart is deleted. Best-effort — never errors out. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cartKey = String(body.cartKey ?? "").slice(0, 64);
    if (!/^[a-z0-9-]{10,64}$/i.test(cartKey)) return NextResponse.json({ ok: false });
    const sb = supabaseServer();

    if (body.recovered === true) {
      await sb.from("abandoned_carts").update({ recovered: true, updated_at: new Date().toISOString() }).eq("cart_key", cartKey);
      return NextResponse.json({ ok: true });
    }

    const items = Array.isArray(body.items) ? body.items.slice(0, 60).map((i: any) => ({
      sku: String(i.sku ?? "").slice(0, 40), name: String(i.name ?? "").slice(0, 120),
      color: i.color ? String(i.color).slice(0, 40) : null,
      qty: Math.max(1, Math.min(999, Math.floor(Number(i.qty) || 1))),
      price: Math.max(0, Math.floor(Number(i.price) || 0)),
    })) : [];
    if (items.length === 0) {
      await sb.from("abandoned_carts").delete().eq("cart_key", cartKey).eq("recovered", false);
      return NextResponse.json({ ok: true });
    }
    const total = items.reduce((s: number, i: any) => s + i.price * i.qty, 0);
    await sb.from("abandoned_carts").upsert({
      cart_key: cartKey, items, total, recovered: false,
      customer_name: body.name ? String(body.name).slice(0, 80) : null,
      phone: body.phone ? String(body.phone).slice(0, 20) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cart_key" });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
