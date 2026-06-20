/**
 * lib/content.ts — product content resolver. Requirement 2.2-2.3.
 * NEVER calls a model on the request path: returns cached generated_content if
 * present, else a deterministic template. The page is never blank, never hangs.
 */
export type GeneratedContent = {
  title: string;
  description: string;
  specs: Record<string, string>;
  tags: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
};

export type ProductLike = {
  name: string;
  sku: string;
  categoryName?: string;
  colors?: string[];
  keywords?: string[];
  generated_content?: GeneratedContent | null;
};

const LOCATION_KEYWORDS = ["Sadar Bazar", "Rui Mandi", "Delhi", "artificial jewellery wholesale"];

/** Deterministic fallback content — pure, instant, location-aware (Req 2.3, 2.5, 16.3). */
export function templateContent(p: ProductLike): GeneratedContent {
  const cat = p.categoryName ?? "Jewellery";
  const colorPhrase = p.colors && p.colors.length ? ` Available in ${p.colors.join(", ")}.` : "";
  const kw = Array.from(new Set([...(p.keywords ?? []), ...LOCATION_KEYWORDS]));
  return {
    title: p.name,
    description:
      `${p.name} — handcrafted artificial ${cat.toLowerCase()} from Blythe Diva, ` +
      `Sadar Bazar, Delhi.${colorPhrase} Premium finish, lightweight, and trend-ready for daily and festive wear. ` +
      `Ideal for retail and wholesale buyers sourcing ${cat.toLowerCase()} in bulk.`,
    specs: {
      SKU: p.sku,
      Category: cat,
      Material: "Brass alloy with anti-tarnish plating",
      Care: "Keep away from water and perfume",
      ...(p.colors && p.colors.length ? { Colors: p.colors.join(", ") } : {}),
    },
    tags: Array.from(new Set([cat, "artificial jewellery", "fashion", ...(p.colors ?? [])])),
    seo: {
      metaTitle: `${p.name} | ${cat} | Blythe Diva Sadar Bazar Delhi`,
      metaDescription: `Buy ${p.name} (${p.sku}) — ${cat.toLowerCase()} at wholesale & retail from Blythe Diva, Sadar Bazar Delhi.`,
      keywords: kw,
    },
  };
}

/** Resolve content: cached first, deterministic template otherwise. No model calls. */
export function resolveProductContent(p: ProductLike): GeneratedContent {
  if (p.generated_content && p.generated_content.title) return p.generated_content;
  return templateContent(p);
}
