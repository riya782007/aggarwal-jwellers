/**
 * lib/ai/gemini.ts — Gemini image generation provider (model: gemini-2.5-flash-image).
 *
 * IMPORTANT: this is NEVER called on a page-render path. It runs only from an explicit
 * "Generate" server action (single or bulk). Until GEMINI_API_KEY is set it returns
 * { ok:false, reason:'no_key' } so the UI shows a clean "connect Gemini" state and the
 * exact prompt that WILL be sent — no hang, no crash.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
 */
const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GenImageResult =
  | { ok: true; base64: string; mime: string }
  | { ok: false; reason: "no_key" | "api_error" | "no_image"; error?: string };

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Generate one editorial model shot from a reference image + prompt.
 * @param referenceBase64 base64 of the source product photo (no data: prefix), optional.
 */
export async function generateImage(opts: {
  prompt: string;
  referenceBase64?: string;
  referenceMime?: string;
  timeoutMs?: number;
}): Promise<GenImageResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  const parts: any[] = [{ text: opts.prompt }];
  if (opts.referenceBase64) {
    parts.push({ inline_data: { mime_type: opts.referenceMime ?? "image/jpeg", data: opts.referenceBase64 } });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: "api_error", error: `HTTP ${res.status}: ${await res.text()}` };
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
