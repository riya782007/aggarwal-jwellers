/**
 * lib/ai/gemini.ts — Gemini image generation (Nano Banana Pro / 2).
 * Default model: gemini-3-pro-image (highest fidelity, "Thinking") — best for reproducing
 * a jewellery design EXACTLY. Override with GEMINI_IMAGE_MODEL (e.g. gemini-3.1-flash-image).
 *
 * NEVER called on a render path — only from an explicit "Generate" action.
 * Until GEMINI_API_KEY is set: { ok:false, reason:'no_key' }.
 */
const MODEL = () => process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image";
const ENDPOINT = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

export type GenImageResult =
  | { ok: true; base64: string; mime: string }
  | { ok: false; reason: "no_key" | "no_source" | "api_error" | "no_image"; error?: string };

export function geminiConfigured(): boolean { return !!process.env.GEMINI_API_KEY; }

export async function generateImage(opts: {
  prompt: string;
  referenceBase64?: string;
  referenceMime?: string;
  aspectRatio?: string;
  timeoutMs?: number;
}): Promise<GenImageResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  // Image FIRST, then the instruction — keeps the reference design front-and-centre.
  const parts: any[] = [];
  if (opts.referenceBase64) parts.push({ inline_data: { mime_type: opts.referenceMime ?? "image/jpeg", data: opts.referenceBase64 } });
  parts.push({ text: opts.prompt });

  const generationConfig: any = { responseModalities: ["IMAGE"] };
  if (opts.aspectRatio) generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetch(ENDPOINT(MODEL()), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: "api_error", error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const json: any = await res.json();
    const outParts = json?.candidates?.[0]?.content?.parts ?? [];
    const img = outParts.find((p: any) => p.inline_data?.data || p.inlineData?.data);
    const data = img?.inline_data?.data ?? img?.inlineData?.data;
    const mime = img?.inline_data?.mime_type ?? img?.inlineData?.mimeType ?? "image/png";
    if (!data) return { ok: false, reason: "no_image", error: "no image part in response" };
    return { ok: true, base64: data, mime };
  } catch (e) {
    return { ok: false, reason: "api_error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}
