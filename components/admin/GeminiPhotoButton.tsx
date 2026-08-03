"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { photoPromptForCategory, FLOW_URL } from "@/lib/geminiPhotoPrompt";

/**
 * GeminiPhotoButton — replaces paid in-app AI photo generation. On click it copies the exact
 * jewellery-photographer prompt (tailored to the product's category) to the clipboard and opens
 * Google Flow (labs.google) in a new tab. The staff then: paste (Ctrl+V) → attach the raw product
 * photo → Enter → download the result → upload it back onto the product. No API cost.
 *
 * Flow has no URL param to pre-fill the prompt, so clipboard + one paste is the closest flow.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function GeminiPhotoButton({
  category,
  label = "✨ Create photo on Google Flow",
  className,
}: {
  /** product category or name — tailors the prompt's product-type line */
  category?: string | null;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const ok = await copyText(photoPromptForCategory(category));
    // Open Google Flow regardless — the prompt is on the clipboard for them to paste.
    window.open(FLOW_URL, "_blank", "noopener");
    setBusy(false);
    toast(
      ok
        ? "Prompt copied ✓ — in Google Flow: paste (Ctrl+V), attach your raw photo, press Enter. It makes a set of shots — download the best and upload them here."
        : "Google Flow opened. Couldn't auto-copy — copy your prompt manually, attach the photo, press Enter.",
      ok ? "success" : "info",
    );
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      title="Opens Google Flow with your jewellery-photo prompt copied — paste it, attach the raw photo, press Enter."
      className={
        className ??
        "inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gold/15 text-gold-dark text-xs font-medium hover:bg-gold/25 transition-colors disabled:opacity-50"
      }
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
