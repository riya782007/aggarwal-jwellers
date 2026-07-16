import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Short QR-label link (0050/Q27): /p/AJ1004 or /p/AJ1004-RED → the live product page.
 *  Kept tiny so the sticker QR stays a small, easily-scanned symbol. Variant SKUs resolve
 *  to their parent design; unknown codes land on the shop instead of a 404. */
export async function GET(req: Request, { params }: { params: { sku: string } }) {
  const base = new URL(req.url).origin;
  const sku = decodeURIComponent(params.sku ?? "").trim();
  if (!sku) return NextResponse.redirect(`${base}/shop`);
  const sb = supabaseServer();

  const sel = "sku, category:categories(slug)";
  let { data: p } = await sb.from("products").select(sel).ilike("sku", sku).maybeSingle();
  if (!p) {
    // Variant sticker (e.g. AJ1004-RED) → parent product.
    const { data: v } = await sb.from("variants").select("product:products(sku, category:categories(slug))").ilike("sku", sku).maybeSingle();
    p = (v as any)?.product ?? null;
  }
  const slug = (p as any)?.category?.slug;
  const psku = (p as any)?.sku;
  return NextResponse.redirect(slug && psku ? `${base}/shop/${slug}/${psku}` : `${base}/shop`, 302);
}
