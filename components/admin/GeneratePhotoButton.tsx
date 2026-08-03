"use client";
import { GeminiPhotoButton } from "@/components/admin/GeminiPhotoButton";

/**
 * "Photo" action on product rows / pages. We no longer call a paid image API — this now opens
 * Google Flow with the jewellery-photo prompt copied to the clipboard (see GeminiPhotoButton).
 * `sku` is kept for call-site compatibility; `category` tailors the prompt when available.
 */
export function GeneratePhotoButton({ sku, category }: { sku?: string; category?: string | null }) {
  return <GeminiPhotoButton category={category} label=" Photo" />;
}
