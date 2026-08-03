"use client";

import { GeminiPhotoButton } from "@/components/admin/GeminiPhotoButton";

/**
 * Per-variant photo action. We no longer call a paid image API — this opens Google Flow with the
 * jewellery-photo prompt copied to the clipboard. Staff paste it, attach the variant's raw photo,
 * press Enter, then upload the result onto the variant. Shown only for variants that have a
 * distinguishing attribute (colour / size / polish).
 */
export default function VariantAiPhoto(props: {
  variantId: string;
  color: string | null;
  size?: string | null;
  polish?: string | null;
  /** product category or name — tailors the prompt's product-type line */
  category?: string | null;
}) {
  const label = (props.color || props.size || props.polish || "").trim();
  if (!label) return null;
  return <GeminiPhotoButton category={props.category ?? label} label={`✨ ${label} photo on Flow`} />;
}
