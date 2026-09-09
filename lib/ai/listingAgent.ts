/**
 * lib/ai/listingAgent.ts — generates a full product page via the AI gateway.
 * Chain: OpenAI (primary) -> Gemini -> Groq -> deterministic template (always).
 * Output is zod-validated; any failure falls back so a page is never blank.
 */
import "server-only";
import { AiGateway, z } from "./gateway";
import { geminiChat, groqChat, openaiChat, geminiTextConfigured, groqConfigured, openaiConfigured } from "./providers";
import { templateContent, availableDivaNames, type GeneratedContent, type ProductLike } from "../content";

const schema = z.object({
  title: z.string().min(2),
  description: z.string().min(60),
  specs: z.record(z.string()),
  tags: z.array(z.string()).min(4),
  seo: z.object({ metaTitle: z.string(), metaDescription: z.string(), keywords: z.array(z.string()).min(5) }),
});

function prompt(p: ProductLike) {
  const colors = (p.colors ?? []).join(", ");
  const sub = (p as any).subcategoryName ? ` Sub-category (type): ${(p as any).subcategoryName}.` : "";
  const kw = (p.keywords ?? []).filter(Boolean).join(", ");
  const hasImage = !!p.imageBase64;
  const reservedNames = [...new Set((p.reservedTitleNames ?? []).map((name) => name.trim()).filter(Boolean))];
  // Hand the writer a rotating shortlist of names that are still FREE, seeded per product, rather
  // than a fixed set of examples. Showing the same handful of example names every time is what
  // anchored the model on one name; a forbidden list alone could not overcome that pull.
  const nameChoices = availableDivaNames(reservedNames, 24, `${p.sku ?? ""}|${p.name ?? ""}`);
  // Cap the forbidden list so a large catalogue cannot crowd out the rest of the prompt.
  const forbidden = reservedNames.slice(0, 200).join(", ");
  return [
    `You are the senior product copywriter for "Aggarwal Jewellers", a Sadar Bazar (Delhi) jewellery house making bridal, AD (American Diamond), anti-tarnish and daily-wear artificial jewellery (retail + wholesale).`,
    `Write ONE product page as STRICT minified JSON with keys: title, description, specs (object label->value), tags (array), seo (object: metaTitle, metaDescription, keywords array).`,
    `INPUTS —`,
    hasImage
      ? `• A PHOTO of the actual jewellery piece is attached — LOOK AT IT CAREFULLY. Identify the jewellery type (necklace set, choker, jhumka, chandbali, ring, bracelet…), the material/work (Kundan, Polki, Meenakari, Pearl, Temple, Oxidised, Moissanite/AD stones…), colours of the stones/beads/enamel, the length/layers, and any included pieces (earrings, maang tikka). Base the title, description, specs, colours and included pieces on WHAT YOU SEE. If the photo and the typed text ever disagree, TRUST THE PHOTO. Never claim a component that is not visible in the photo and not in the specifications.`
      : ``,
    `• Product name the owner typed: ${p.name}`,
    `• Category: ${p.categoryName ?? "Jewellery"}.${sub}`,
    colors ? `• Colours: ${colors}.` : ``,
    kw
      ? `• Jewellery SPECIFICATIONS the owner provided — USE THESE to decide the material, style, type AND which pieces the set includes: ${kw}.`
      : hasImage
        ? `• No extra specifications given — infer the material, style, type and included pieces from the ATTACHED PHOTO and the product name & category; do not invent anything not visible in the photo.`
        : `• No extra specifications given — infer ONLY from the product name & category; do not invent components or materials.`,
    ``,
    `TITLE — MUST follow Aggarwal Jewellers's exact house style:  «{First name} {material/style descriptors} {jewellery type} with {included pieces}»`,
    `  1. START with a single elegant Indian girl's first name, chosen from THIS list of names that are still FREE in the catalogue: ${nameChoices.join(", ")}.`,
    `     Pick the ONE that best suits this piece — vary your choice, and never pick a name outside the list above.${reservedNames.length ? ` The following names are ALREADY USED and are strictly forbidden: ${forbidden}.` : ""}`,
    `  2. Then descriptors drawn ONLY from the name + specifications: material (Kundan, Uncut Kundan, Acrylic Kundan, Meenakari, Temple, Polki, Pearl, Moissanite, Turkish Stone, Crystal, Oxidised…), style/length (Semi Long, Long, Double Layer, Layered, Single Line, Choker…), design (Chandbali, Jhumka, Danglers…).`,
    `  3. Then the jewellery TYPE from the category (Necklace Set, Choker Set, Earrings, Ring, Bracelet…). If it ships with extra pieces, use "Set".`,
    `  4. If the specifications list included pieces (earrings, maang tikka, finger ring…), append "with {those pieces}" — e.g. "with Maang Tikka", "with Maang Tikka and Finger Ring".`,
    `  LENGTH: aim for 5-10 words with 2-4 descriptors — rich like Aggarwal Jewellers's live catalogue, not a bare 3-word title.`,
    `  REAL live Aggarwal Jewellers titles to mirror for STRUCTURE, STYLE & LENGTH ONLY — the names are written as {Name} on purpose, because copying a name from an example is what made the catalogue repeat one name hundreds of times. Take the wording pattern from these, take the NAME from the free list above: "{Name} Semi Long Uncut Kundan Necklace Set with Maang Tikka", "{Name} Double Layer Uncut Kundan Long Necklace Set with Maang Tikka", "{Name} Layered Kundan Necklace Set with Maang Tikka and Finger Ring", "{Name} Acrylic Kundan Chandbali Hanging Pearls", "{Name} Turkish Stone Single Line Choker", "{Name} Moissanite Choker Set", "{Name} Meenakari Chandbali with Hanging Pearls", "{Name} Kundan Chandbali with Hanging Jhumka", "{Name} Crystal Stone Danglers".`,
    `  ABSOLUTELY DO NOT put a SKU, any product code, price, hyphen+code, or the word "Aggarwal Jewellers" in the title. Title Case, under ~70 characters.`,
    ``,
    `REGISTER — read the name + specifications and pick the RIGHT voice:`,
    `  • If they say western, daily wear, office, casual, minimal, anti-tarnish, contemporary, modern (and it is NOT a kundan/temple/polki/bridal set): write a WESTERN / DAILY-WEAR description — everyday styling, work-to-evening, pairs with dresses, jeans, kurtis, co-ords & western outfits; mention anti-tarnish/lightweight/skin-friendly/gift-ready if relevant. DO NOT mention brides, sarees, lehengas, weddings, sangeet or "royal/bridal".`,
    `  • Otherwise use the ETHNIC / BRIDAL voice below. Weave the owner's keywords in naturally for SEO either way.`,
    ``,
    `DESCRIPTION (ethnic/bridal voice) — match Aggarwal Jewellers's voice EXACTLY, 70-120 words, in this order:`,
    `  a) Open: "Add royal elegance to your festive look with {the exact title you wrote} by Aggarwal Jewellers."`,
    `  b) Design: "Designed in a {style} style, this {type} features {material} detailing that gives a rich traditional and bridal appeal."`,
    `  c) Included + occasions: if it's a set, state the exact pieces included (from the specifications, e.g. "a matching pair of earrings and maang tikka"), then "making it a complete jewellery choice for weddings, engagement ceremonies, sangeet, haldi-mehendi functions, festive celebrations, and family occasions."`,
    `  d) Pairing: "Its elegant ethnic design pairs beautifully with sarees, lehengas, anarkalis, shararas, and bridal outfits."`,
    `  e) Close: "Perfect for brides, bridesmaids, and women who love statement Indian jewellery, this {type} adds charm, richness, and timeless beauty to special occasion styling."`,
    `  CRITICAL: claim ONLY the pieces/materials supported by the name or the specifications — never invent components that were not provided.`,
    ``,
    `specs (object) MUST include: Category, Material, Work/Style, Occasion, Care${colors ? ", Colours" : ""}, and Includes (if it's a set). DO NOT include the SKU.`,
    `tags: 8-12 short search tags mixing type, style, material, occasion.`,
    `seo.metaTitle <= 60 chars (the product title ALONE — do NOT append any brand/site name; the site layout adds " | Aggarwal Jewellers" automatically); seo.metaDescription <= 155 chars, compelling; seo.keywords 8-12 long-tail phrases like "kundan necklace set for wedding", "artificial jewellery online India", "bridal jewellery Delhi".`,
    `Return ONLY the JSON object, minified, no markdown.`,
  ].filter(Boolean).join("\n");
}

export function buildGateway() {
  // OpenAI is the PRIMARY writer (the owner sets OPENAI_API_KEY for high-quality Aggarwal Jewellers titles);
  // Gemini retains image grounding; Groq is the final text-only fallback before the deterministic template.
  return new AiGateway({
    primary: {
      name: "openai",
      // OpenAI is vision-capable (gpt-4o-mini), so when the owner's product photo is present we
      // attach it — the model reads the piece off the image, not just the typed text.
      run: async (call: any) => JSON.parse(await openaiChat({
        system: "You are Aggarwal Jewellers's product copywriter. Return only valid minified JSON.",
        user: call._prompt, json: true,
        imageBase64: call._product?.imageBase64, imageMime: call._product?.imageMime,
      })),
    },
    secondary: {
      // Gemini can use the same product photo, preserving image-grounded copy if OpenAI is unavailable.
      name: "gemini",
      run: async (call: any) => JSON.parse(await geminiChat({
        system: "You are Aggarwal Jewellers's product copywriter. Return only valid minified JSON.",
        user: call._prompt, json: true,
        imageBase64: call._product?.imageBase64, imageMime: call._product?.imageMime,
      })),
    },
    fallbacks: [{
      // Groq is the final text-only AI fallback before deterministic content.
      name: "groq",
      run: async (call: any) => JSON.parse(await groqChat({ system: "You are Aggarwal Jewellers's product copywriter. Return only valid minified JSON.", user: call._prompt, json: true })),
    }],
    deterministic: (call: any) => templateContent(call._product) as GeneratedContent,
    budgetPaise: Number(process.env.AI_BUDGET_PAISE ?? 500000),
    maxRetries: 1,
    breakerThreshold: 3,
    log: (e) => console.log("[ai]", JSON.stringify(e)),
  });
}

export async function generateProductContent(p: ProductLike): Promise<{ content: GeneratedContent; provider: string; fallbackUsed: boolean }> {
  const gateway = buildGateway();
  const call: any = { feature: "listing", cacheKey: `listing:${p.sku}`, schema, estCostPaise: 50, _prompt: prompt(p), _product: p };
  const r = await gateway.run(call);
  return { content: r.data as GeneratedContent, provider: r.provider, fallbackUsed: r.fallbackUsed };
}

export function aiProvidersStatus() {
  return { groq: groqConfigured(), openai: openaiConfigured(), gemini: geminiTextConfigured() };
}

/** 0049 — several distinct title options for the picker (name/description align with the
 *  chosen one via the normal generate path). One model call; deterministic fallback. */
export async function generateTitleOptions(p: ProductLike, n = 4): Promise<{ titles: string[]; provider: string }> {
  const base = await generateProductContent(p);
  const first = base.content.title;
  const titles = new Set<string>([first]);
  // Extra options re-seed the name only. This used to draw from a hardcoded list of ten names —
  // which, with the same ten shown as prompt examples, is why 68% of catalogue titles started
  // with one of them. Draw from names still FREE in the catalogue instead, and never re-offer
  // the name the writer just used.
  const words = first.split(" ");
  const taken = [...(p.reservedTitleNames ?? []), words[0] ?? ""];
  const choices = availableDivaNames(taken, Math.max(n * 3, 12), `${p.sku ?? ""}|${p.name ?? ""}|options`);
  for (let i = 0; titles.size < n && i < choices.length; i++) {
    if (/^[A-Z][a-z]+$/.test(words[0])) titles.add([choices[i], ...words.slice(1)].join(" "));
  }
  return { titles: [...titles].slice(0, n), provider: base.provider };
}