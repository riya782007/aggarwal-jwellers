import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseGroupScan } from "@/lib/groupQr";
import { escapeIlikeExact } from "@/lib/scan";

/** Box-sticker URL (`/g/GRP-AB12CD` or `/g/BOX:AJDH1931:12`). HID scanners dump this into POS;
 *  a phone camera opening the link should still land on the piece, not a 404. */
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const base = new URL(req.url).origin;
  const parsed = parseGroupScan(params.code);
  const code = parsed?.code ?? decodeURIComponent(params.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.redirect(`${base}/shop`, 302);
  const sb = supabaseServer();
  const { data: g } = await sb.from("inventory_groups").select("product:products(sku), variant:variants(sku)").ilike("code", escapeIlikeExact(code)).limit(1).maybeSingle();
  const sku = (g as any)?.variant?.sku || (g as any)?.product?.sku || (parsed?.kind === "box" ? parsed.sku : "");
  if (!sku) return NextResponse.redirect(`${base}/shop`, 302);
  return NextResponse.redirect(`${base}/p/${encodeURIComponent(sku)}`, 302);
}
