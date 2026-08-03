/**
 * lib/geminiPhotoPrompt.ts — the exact jewellery-photographer prompt the shop pastes into
 * Google Flow (labs.google) to turn a raw product photo into a professional on-model image.
 *
 * We DON'T call a paid image API for this any more — staff click "Create photo on Google Flow",
 * the prompt is copied to their clipboard, Flow opens, they paste + attach the raw photo +
 * press Enter, then upload the result back onto the product. photoPromptForCategory() appends
 * the right product-type line so earrings / rings / bangles / bridal sets each get framed well.
 */

export const GEMINI_PHOTO_PROMPT_BASE = `You are a professional luxury jewellery product photographer, fashion art director, and high-end commercial retoucher specializing in e-commerce.

PRIMARY OBJECTIVE
The jewellery shown in the input image is the PRODUCT. It is NOT a reference or inspiration.
Your highest priority is preserving the jewellery EXACTLY as provided.
Do NOT redesign, reinterpret, simplify, beautify, or modify any part of the jewellery.
The final output must look like the exact same physical jewellery photographed on a professional model.
──────────────────────────────
OUTPUT — GENERATE A SET OF IMAGES (NOT JUST ONE)
Produce MULTIPLE distinct images of the SAME jewellery on the SAME model in one batch — a complete, cohesive e-commerce photo set. Generate at least 4 images:
1. HERO — front-facing on-model shot with the entire piece clearly visible.
2. CLOSE-UP — a tight macro detail crop that fills the frame with the jewellery so every stone, motif, and texture can be inspected.
3. THREE-QUARTER — the model turned roughly 30–45°, with the jewellery still fully visible and facing the camera.
4. EDITORIAL — a premium campaign-style pose where the jewellery remains the hero and stays completely visible.
Across the whole set, keep the SAME model, lighting, background style, and colour accuracy so the images look like one catalogue shoot.
Vary ONLY the angle, framing, and pose between images — NEVER the jewellery.
Every single image must obey all the jewellery-preservation rules below. If you can output more than 4, add extra angles (e.g. back/clasp view, worn-in-context) following the same rules.
──────────────────────────────
JEWELLERY PRESERVATION RULES
Every visible part of the jewellery must remain identical, including but not limited to:
• Overall shape
• Size and proportions
• Design language
• Curves
• Thickness
• Surface textures
• Metal finish
• Polish
• Stone count
• Stone placement
• Stone size
• Stone colour
• Stone cut
• Stone orientation
• Pearl count
• Pearl placement
• Bead placement
• Filigree
• Engraving
• Pattern
• Motifs
• Hanging elements
• Chains
• Hooks
• Clasps
• Locks
• Connectors
• Links
• Borders
• Edges
• Decorative elements
Nothing may be added.
Nothing may be removed.
Nothing may be shifted.
Nothing may be resized.
Nothing may be recoloured.
Nothing may be replaced.
No AI hallucinations.
No creative redesign.
If any detail is unclear, preserve it rather than inventing a new design.
──────────────────────────────
COMPLETE PRODUCT VISIBILITY
The entire jewellery piece must be visible.
Never crop:
• Earrings
• Necklace ends
• Pendant
• Bangles
• Bracelets
• Rings
• Chains
• Clasps
• Matching accessories
• Hanging parts
• Side details
• Bottom details
• Top connectors
No part should disappear behind hair, clothing, hands, arms, shoulders or body.
Hair must always be styled so jewellery remains fully visible.
If required, tuck hair behind ears.
Maintain unobstructed visibility from top to bottom.
──────────────────────────────
MATCHING SETS
If the input contains multiple matching items, every item must appear.
Examples:
Necklace + Earrings
Necklace + Earrings + Maang Tikka
Necklace + Earrings + Bracelet
Necklace + Earrings + Ring
Complete Bridal Set
Never omit any accessory.
Never generate only part of the set.
Every matching component must exactly correspond to the uploaded design.
──────────────────────────────
MODEL
Use an elegant Indian female professional model suitable for premium jewellery campaigns.
Age:
22–32
Skin:
Natural healthy skin texture.
Minimal retouching.
Luxury beauty campaign appearance.
Expression:
Confident
Elegant
Soft smile or neutral.
Natural makeup.
No distracting makeup.
No excessive jewellery.
No tattoos.
No visible body piercings except required jewellery.
──────────────────────────────
POSE
Pose should showcase the jewellery.
The model is secondary.
The jewellery is the hero.
Choose angles that maximize product visibility.
Never hide the jewellery with hands.
Never cover jewellery using fingers.
Necklaces should lie naturally.
Earrings should face the camera.
Bracelets should be rotated for visibility.
Rings should be clearly visible.
──────────────────────────────
LIGHTING
Professional luxury jewellery lighting.
Soft studio lighting.
Controlled highlights.
Natural reflections.
No blown highlights.
No crushed shadows.
Excellent gemstone sparkle while preserving realism.
Maintain accurate metal colour.
──────────────────────────────
BACKGROUND
Luxury premium e-commerce background.
Clean.
Minimal.
Neutral.
Soft gradients.
No distracting props.
No clutter.
No text.
No watermark.
No logo.
──────────────────────────────
CAMERA
High-end medium format camera look.
100mm portrait lens.
Ultra sharp focus.
Natural depth of field.
Luxury catalogue quality.
8K commercial photography.
True-to-life colour accuracy.
──────────────────────────────
FABRIC
Elegant premium clothing that complements the jewellery.
Solid colours.
No embroidery covering jewellery.
No competing patterns.
No distracting textures.
──────────────────────────────
E-COMMERCE REQUIREMENTS
The image must be suitable for:
Luxury catalogue
Website product page
Marketplace listing
Brand campaign
Print catalogue
High-resolution zoom
Customers must clearly inspect every detail of the jewellery before purchase.
──────────────────────────────
STRICTLY AVOID
❌ Missing stones
❌ Extra stones
❌ Different chain
❌ Different pendant
❌ Different clasp
❌ Different hooks
❌ Different polish
❌ Different metal colour
❌ Hallucinated details
❌ Cropped jewellery
❌ Hair covering earrings
❌ Hair covering necklace
❌ Clothing hiding jewellery
❌ Hands blocking jewellery
❌ Perspective distortion
❌ Design modifications
❌ AI-generated replacements
❌ Fantasy redesign
❌ Decorative additions
❌ Incomplete jewellery
──────────────────────────────
FINAL QUALITY CHECK
Before producing the final image, verify:
✓ Every jewellery component is present.
✓ Every stone is preserved.
✓ Every accessory is present.
✓ The jewellery matches the uploaded image exactly.
✓ No detail has changed.
✓ Nothing is cropped.
✓ Nothing is hidden.
✓ Colours are identical.
✓ The complete product is visible.
If any condition fails, regenerate until the jewellery is an exact representation of the uploaded product while presented professionally on the model.
Run this check on EVERY image in the set — all of them must pass before you finish.`;

// Product-type tail appended based on the product's category, per the client's spec.
const NECKLACE = `Ensure the necklace sits naturally around the neck while remaining fully visible, with both earrings facing the camera and no hair obscuring them.`;
const EARRINGS = `Frame the image from the shoulders upward, keep hair tucked behind both ears, and ensure both earrings are fully visible, symmetrical, and sharply focused.`;
const RING = `Create a close-up hand pose that showcases the ring from the front and slightly angled view, ensuring no fingers obscure the design.`;
const BANGLE = `Position the wrist naturally with a slight rotation so the complete circumference and design of the jewellery are clearly visible.`;
const BRIDAL = `Display every component of the bridal set together, ensuring no item is omitted or obscured, while maintaining a premium bridal editorial look.`;

/** Pick the right product-type instruction from a free-text category/product name. */
export function photoTypeSuffix(categoryOrName?: string | null): string {
  const s = (categoryOrName ?? "").toLowerCase();
  if (/bridal|dulhan|set/.test(s)) return BRIDAL;
  if (/earring|jhumk|bali|stud|tops/.test(s)) return EARRINGS;
  if (/\bring\b|anguthi|finger/.test(s)) return RING;
  if (/bangle|bracelet|chura|kada|kangan|wrist/.test(s)) return BANGLE;
  if (/necklace|haar|chain|pendant|choker|rani|mala/.test(s)) return NECKLACE;
  return NECKLACE; // sensible default for jewellery
}

/** The full prompt to paste into Gemini, tailored to the product's category. */
export function photoPromptForCategory(categoryOrName?: string | null): string {
  return `${GEMINI_PHOTO_PROMPT_BASE}\n\n${photoTypeSuffix(categoryOrName)}`;
}

/** Google Flow (Labs) image tool — staff paste the prompt, attach the raw photo, press Enter. */
export const FLOW_URL = "https://labs.google/fx/tools/flow";
