import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { groupCodeFromScan } from "@/lib/groupQr";
import { escapeIlikeExact } from "@/lib/scan";

/** Box-sticker URL (`/g/GRP-AB12CD`). HID scanners dump this into POS; a phone camera
 *  opening the link should still land on the piece, not a 404. */
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const base = new URL(req.url).origin;
  const code = groupCodeFromScan(params.code) ?? decodeURIComponent(params.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.redirect(`${base}/shop`, 302);
  const sb = supabaseServer();
  const { data: g } = await sb.from("inventory_groups").select("status, product:products(sku), variant:variants(sku)").ilike("code", escapeIlikeExact(code)).maybeSingle();
  if (!g || (g as any).status !== "active") return NextResponse.redirect(`${base}/shop`, 302);
  const sku = (g as any).variant?.sku || (g as any).product?.sku;
  if (!sku) return NextResponse.redirect(`${base}/shop`, 302);
  return NextResponse.redirect(`${base}/p/${encodeURIComponent(sku)}`, 302);
}
