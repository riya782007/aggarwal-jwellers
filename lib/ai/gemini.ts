/**
 * lib/ai/gemini.ts — Gemini image generation (Nano Banana Pro / 2 / 1).
 *
 * Per the official Gemini image-generation docs (ai.google.dev/gemini-api/docs/image-generation):
 *   - Endpoint:  https://generativelanguage.googleapis.com/v1/models/<model>:generateContent
 *   - responseModalities MUST be ["TEXT","IMAGE"]  (image-only ["IMAGE"] is rejected → 400)
 *   - imageConfig.aspectRatio supports "4:5" etc.
 *
 * Valid model ids:
 *   gemini-3-pro-image      → Nano Banana Pro  (highest fidelity, "Thinking")
 *   gemini-3.1-flash-image  → Nano Banana 2    (fast, excellent fidelity — docs default)
 *   gemini-2.5-flash-image  → Nano Banana 1    (stable, widest availability)
 *
 * We try the configured/primary model first, then fall back down the chain if a model is
 * unavailable on the key's tier (403/404) or rejects the request (400). This makes the
 * raw→model-shot feature work even if a project lacks access to the Pro model.
 *
 * NEVER called on a render path — only from an explicit "Generate" action.
 * Until GEMINI_API_KEY is set: { ok:false, reason:'no_key' }.
 */
const PRIMARY = () => process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image";

/** Build the fallback chain: primary first, then the rest (deduped). */
function modelChain(): string[] {
  const chain = [PRIMARY(), "gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];
  return [...new Set(chain)];
}

const ENDPOINT = (m: string) => `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent`;

export type GenImageResult =
  | { ok: true; base64: string; mime: string; model: string }
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

  const generationConfig: any = { responseModalities: ["TEXT", "IMAGE"] };
  if (opts.aspectRatio) generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };

  const body = JSON.stringify({ contents: [{ role: "user", parts }], generationConfig });
  const chain = modelChain();
  let lastErr = "";

  for (const model of chain) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
    try {
      const res = await fetch(ENDPOINT(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = (await res.text()).slice(0, 400);
        lastErr = `[${model}] HTTP ${res.status}: ${txt}`;
        console.error("[gemini] image api error:", lastErr);
        // 400/403/404 → likely this model isn't available/accepted on this key; try the next.
        if (res.status === 400 || res.status === 403 || res.status === 404) continue;
        // Other errors (429/500) are not model-specific — stop and report.
        return { ok: false, reason: "api_error", error: lastErr };
      }
      const json: any = await res.json();
      const outParts = json?.candidates?.[0]?.content?.parts ?? [];
      const img = outParts.find((p: any) => p.inline_data?.data || p.inlineData?.data);
      const data = img?.inline_data?.data ?? img?.inlineData?.data;
      const mime = img?.inline_data?.mime_type ?? img?.inlineData?.mimeType ?? "image/png";
      if (!data) {
        lastErr = `[${model}] no image part in response`;
        console.error("[gemini]", lastErr);
        continue;
      }
      return { ok: true, base64: data, mime, model };
    } catch (e) {
      lastErr = `[${model}] ${e instanceof Error ? e.message : String(e)}`;
      console.error("[gemini] fetch threw:", lastErr);
      // network/timeout — try the next model too.
      continue;
    } finally {
      clearTimeout(t);
    }
  }

  return { ok: false, reason: "api_error", error: lastErr || "all models failed" };
}
