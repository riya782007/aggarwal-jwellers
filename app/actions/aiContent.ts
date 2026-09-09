"use server";
/** AI product-page content generation (Listing Agent). Explicit button only — never on render. */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getProductBySku, getPublishedProducts } from "@/lib/supabase/queries";
import { generateProductContent } from "@/lib/ai/listingAgent";
import { requirePerm } from "@/lib/auth";

export type ContentResult = { ok: boolean; sku: string; provider?: string; fallbackUsed?: boolean; title?: string; error?: string };

/**
 * First-name prefixes already used by catalogue titles, so a new listing never reuses one.
 *
 * Every generation path must pass these. The "Suggest title" buttons in the product editor did
 * NOT, which is why one name ended up on 165 products: the writer was never told it was taken.
 *
 * Selects just the title (not the whole generated_content blob) and pages past PostgREST's
 * 1000-row cap — an unpaged read silently stopped at the first 1000 products, so names used by
 * the newest listings looked free and got handed out again.
 */
async function usedTitleNames(excludeProductId?: string): Promise<string[]> {
  const sb = supabaseServer();
  const names = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from("products")
      .select("title:generated_content->>title")
      .not("generated_content", "is", null)
      .range(from, from + PAGE - 1);
    if (excludeProductId) q = q.neq("id", excludeProductId);
    const { data, error } = await q;
    if (error || !data?.length) break;
    for (const row of data as any[]) {
      const first = String(row?.title ?? "").trim().split(/\s+/)[0];
      if (/^[\p{L}][\p{L}'-]*$/u.test(first)) names.add(first);
    }
    if ((data as any[]).length < PAGE) break;
  }
  return [...names];
}

/**
 * Downloads the product's best available photo and returns it as base64 so the AI can
 * SEE the piece while writing the title & description. Prefers the owner's raw/source
 * photo, then the AI model shot, then any http image. Best-effort — returns undefined
 * on any failure so title generation still works without a picture.
 */
async function fetchProductImage(p: any): Promise<{ imageBase64?: string; imageMime?: string }> {
  try {
    const imgs = (p.images ?? []).filter((i: any) => typeof i?.path === "string" && i.path.startsWith("http"));
    if (!imgs.length) return {};
    const pick =
      imgs.find((i: any) => i.kind === "source" || i.kind === "flatlay") ??
      imgs.find((i: any) => i.kind === "model") ??
      imgs[0];
    const r = await fetch(pick.path, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return {};
    const imageMime = r.headers.get("content-type") || "image/jpeg";
    const imageBase64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    return { imageBase64, imageMime };
  } catch {
    return {};
  }
}

export async function generateContentAction(sku: string, keywords?: string[]): Promise<ContentResult> {
  if (!(await requirePerm("catalog.ai"))) return { ok: false, sku, error: "not permitted" };
  const p = await getProductBySku(sku);
  if (!p) return { ok: false, sku, error: "not found" };
  const colors = (p.variants ?? []).map((v) => v.color ?? "").filter(Boolean);
  const { imageBase64, imageMime } = await fetchProductImage(p);
  // Give the writer the existing title prefixes so each new listing receives a distinct house name.
  const reservedTitleNames = await usedTitleNames(p.id);
  const { content, provider, fallbackUsed } = await generateProductContent({
    name: p.name, sku: p.sku, categoryName: p.category?.name, colors,
    keywords: (keywords ?? []).map((k) => k.trim()).filter(Boolean),
    imageBase64, imageMime, reservedTitleNames,
  });
  const { error } = await supabaseServer().from("products").update({ generated_content: content }).eq("id", p.id);
  if (error) return { ok: false, sku, error: error.message };
  revalidatePath(`/shop/${p.category.slug}/${sku}`);
  revalidatePath("/admin/catalogue");
  return { ok: true, sku, provider, fallbackUsed, title: content.title };
}

/** Suggest a polished product title from a name + category (Req 6). Explicit button only. */
export async function suggestProductTitleAction(input: { name: string; category?: string; keywords?: string[]; sku?: string }): Promise<{ ok: boolean; title?: string; description?: string; provider?: string; fallbackUsed?: boolean; usedImage?: boolean; error?: string }> {
  if (!(await requirePerm("catalog.edit"))) return { ok: false, error: "not permitted" };
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a product name first" };
  try {
    // If we know the product (editing an existing one), pull its uploaded photo so the AI
    // writes the title & description from what the piece actually looks like.
    let imageBase64: string | undefined, imageMime: string | undefined;
    if (input.sku) {
      const p = await getProductBySku(input.sku);
      if (p) ({ imageBase64, imageMime } = await fetchProductImage(p));
    }
    const { content, provider, fallbackUsed } = await generateProductContent({
      name, sku: input.sku || name, categoryName: input.category, colors: [],
      keywords: (input.keywords ?? []).map((k) => k.trim()).filter(Boolean),
      imageBase64, imageMime,
      // Without this the suggester had no idea which names were taken and kept proposing the
      // same one — this button is where most repeated titles came from.
      reservedTitleNames: await usedTitleNames(),
    });
    return { ok: true, title: content.title, description: content.description, provider, fallbackUsed, usedImage: !!imageBase64 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not suggest a title" };
  }
}

export async function generateAllContentAction(): Promise<{ total: number; ok: number; results: ContentResult[] }> {
  const products = await getPublishedProducts();
  const results: ContentResult[] = [];
  for (const p of products) results.push(await generateContentAction(p.sku));
  revalidatePath("/admin/catalogue");
  return { total: products.length, ok: results.filter((r) => r.ok).length, results };
}

/** 0049 — suggest 3-4 title options; the owner picks one and name/description follow. */
export async function suggestTitleOptionsAction(input: { name: string; category?: string; keywords?: string[]; sku?: string }): Promise<{ ok: boolean; titles?: string[]; error?: string }> {
  if (!(await requirePerm("catalog.edit"))) return { ok: false, error: "not permitted" };
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a product name first" };
  try {
    let imageBase64: string | undefined, imageMime: string | undefined;
    if (input.sku) {
      const p = await getProductBySku(input.sku);
      if (p) ({ imageBase64, imageMime } = await fetchProductImage(p));
    }
    const { generateTitleOptions } = await import("@/lib/ai/listingAgent");
    const { titles } = await generateTitleOptions({
      name, sku: input.sku || name, categoryName: input.category, colors: [],
      keywords: (input.keywords ?? []).map((k) => k.trim()).filter(Boolean), imageBase64, imageMime,
      reservedTitleNames: await usedTitleNames(),
    });
    return { ok: true, titles };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not suggest titles" };
  }
}