"use server";
/**
 * Server actions for AI image generation. Invoked ONLY by explicit buttons — never on render.
 * Builds the locked prompt, calls Gemini (when GEMINI_API_KEY is set), stores the result in
 * Supabase Storage, and records a product_images row. Degrades cleanly when the key is absent.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getProductBySku, getPublishedProducts } from "@/lib/supabase/queries";
import { buildImagePrompt } from "@/lib/ai/imagePrompt";
import { generateImage, geminiConfigured } from "@/lib/ai/gemini";

const BUCKET = "generated";

async function ensureBucket() {
  const sb = supabaseServer();
  // createBucket is idempotent-ish; ignore "already exists"
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
}

export type GenResult = { ok: boolean; sku: string; reason?: string; url?: string; prompt?: string };

export async function generateOneAction(sku: string): Promise<GenResult> {
  const p = await getProductBySku(sku);
  if (!p) return { ok: false, sku, reason: "not_found" };

  const index = parseInt(sku.replace(/\D/g, ""), 10) || 0;
  const prompt = buildImagePrompt({ category: p.category?.slug ?? "necklace", index, aspect: "4:5" });

  if (!geminiConfigured()) {
    // Key not integrated yet — return the exact prompt so the owner sees it's real & ready.
    return { ok: false, sku, reason: "no_key", prompt };
  }

  // Optional: fetch an existing reference photo if one is a real URL.
  let referenceBase64: string | undefined;
  const ref = (p.images ?? []).find((i) => i.path.startsWith("http"));
  if (ref) {
    try {
      const r = await fetch(ref.path);
      const buf = Buffer.from(await r.arrayBuffer());
      referenceBase64 = buf.toString("base64");
    } catch {}
  }

  const result = await generateImage({ prompt, referenceBase64 });
  if (!result.ok) return { ok: false, sku, reason: result.reason, prompt };

  await ensureBucket();
  const sb = supabaseServer();
  const ext = result.mime.includes("png") ? "png" : "jpg";
  const path = `${sku}/model-${Date.now()}.${ext}`;
  const bytes = Buffer.from(result.base64, "base64");
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: result.mime, upsert: true });
  if (up.error) return { ok: false, sku, reason: "upload_failed: " + up.error.message, prompt };

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;
  await sb.from("product_images").insert({ product_id: p.id, path: url, kind: "model", sort: -1 });

  revalidatePath(`/shop/${p.category.slug}/${sku}`);
  revalidatePath("/admin/catalogue");
  return { ok: true, sku, url };
}

export async function generateAllAction(): Promise<{ total: number; ok: number; needsKey: boolean; results: GenResult[] }> {
  const products = await getPublishedProducts();
  if (!geminiConfigured()) {
    return { total: products.length, ok: 0, needsKey: true, results: products.map((p) => ({ ok: false, sku: p.sku, reason: "no_key" })) };
  }
  const results: GenResult[] = [];
  // Sequential to respect rate limits; the gateway/circuit-breaker pattern guards production.
  for (const p of products) results.push(await generateOneAction(p.sku));
  revalidatePath("/admin/catalogue");
  return { total: products.length, ok: results.filter((r) => r.ok).length, needsKey: false, results };
}
