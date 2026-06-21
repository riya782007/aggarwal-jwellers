"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function createReelAction(formData: FormData) {
  const caption = String(formData.get("caption") ?? "").trim();
  const videoUrl = String(formData.get("video_url") ?? "").trim() || null;
  const skus = String(formData.get("skus") ?? "").split(/[, \n]+/).map((s) => s.trim()).filter(Boolean);
  if (!caption) return;
  const sb = supabaseServer();
  const { data: reel } = await sb.from("reels").insert({ caption, video_url: videoUrl, ig_id: `IG_${Date.now()}`, posted_at: new Date().toISOString() }).select("id").single();
  if (reel && skus.length) {
    const { data: prods } = await sb.from("products").select("id,sku").in("sku", skus);
    const rows = ((prods as any[]) ?? []).map((p) => ({ reel_id: reel.id, product_id: p.id }));
    if (rows.length) await sb.from("reel_products").insert(rows);
  }
  revalidatePath("/admin/reels"); revalidatePath("/reels"); revalidatePath("/shop");
}

export async function deleteReelAction(formData: FormData) {
  const id = String(formData.get("id"));
  await supabaseServer().from("reels").delete().eq("id", id);
  revalidatePath("/admin/reels"); revalidatePath("/reels"); revalidatePath("/shop");
}
