/**
 * Box QR payload — encodes the PIECE SKU + pack count (not a random GRP-… code).
 *
 * Piece labels encode the SKU. Box labels must stay distinct (so a box scan adds N pieces,
 * not one) while still carrying the real SKU the box contains. Format:
 *   BOX:<pieceSku>:<packQty>   e.g. BOX:AJ1004:5  or  BOX:AJ1004-RED:6
 *
 * Older stickers that encoded GRP-XXXXXX still parse and resolve via inventory_groups.
 */
import { formatPaise } from "./pricing";

export const BOX_QR_PREFIX = "BOX:";

export function boxQrPayload(pieceSku: string, packQty: number): string {
  const sku = (pieceSku ?? "").trim();
  const n = Math.max(1, Math.floor(Number(packQty) || 1));
  return `${BOX_QR_PREFIX}${sku}:${n}`;
}

export type ParsedBoxScan =
  | { kind: "payload"; sku: string; packQty: number }
  | { kind: "legacyCode"; code: string };

function decodeUrlGroup(raw: string): string | null {
  const m = raw.match(/\/g\/([A-Za-z0-9%._:-]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** True when a scanned string is a box QR (new payload, /g/… URL, or legacy GRP-…). */
export function parseBoxScan(raw: string): ParsedBoxScan | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const fromUrl = decodeUrlGroup(s);
  const body = fromUrl ?? s;

  const payload = body.match(/BOX:([^:\s]+):(\d+)/i);
  if (payload) {
    const packQty = Math.floor(Number(payload[2]));
    if (packQty >= 1 && payload[1].trim()) return { kind: "payload", sku: payload[1].trim(), packQty };
  }

  const legacy = body.match(/GRP-[A-Za-z0-9]+/i);
  if (legacy) return { kind: "legacyCode", code: legacy[0].toUpperCase() };
  return null;
}

export function isBoxScan(raw: string): boolean {
  return parseBoxScan(raw) != null;
}

/** Owner price cipher used on piece labels: A + 7{wholesale}7 + {retail} + 51 */
export function ownerPriceCode(wholesalePaise: number, retailPaise: number): string {
  const w = Math.round((Number(wholesalePaise) || 0) / 100);
  const r = Math.round((Number(retailPaise) || 0) / 100);
  const wPart = w > 0 ? `7${w}7` : "";
  const rPart = r > 0 ? String(r) : "";
  if (!wPart && !rPart) return "";
  return `A${wPart}${rPart}51`;
}

/** Sticker text under the SKU: pack count + the same price numbers as a piece label. */
export function boxLabelPriceLine(packQty: number, wholesalePaise: number, retailPaise: number): string {
  const n = Math.max(1, Math.floor(Number(packQty) || 1));
  const code = ownerPriceCode(wholesalePaise, retailPaise);
  return code ? `×${n}  ${code}` : `BOX OF ${n}`;
}

export function boxPdfLabel(box: {
  sku: string; name: string; packQty: number; price?: number; wholesale?: number;
}): { name: string; sku: string; qrValue: string; priceLine: string; showName: boolean; showSku: boolean } {
  return {
    name: box.name,
    sku: box.sku,
    qrValue: boxQrPayload(box.sku, box.packQty),
    priceLine: boxLabelPriceLine(box.packQty, box.wholesale ?? 0, box.price ?? 0),
    showName: true,
    showSku: true,
  };
}

/** After a box scan: show piece SKU, pack count, unit price and box total — same facts as the sticker. */
export function boxScanFeedback(opts: {
  sku: string; name: string; packQty: number; addQty: number;
  unitPaise: number; stock: number;
}): { text: string; ok: boolean } {
  if (opts.addQty <= 0) return { text: `${opts.sku} · ${opts.name}: out of stock`, ok: false };
  const short = opts.stock < opts.packQty;
  const each = formatPaise(opts.unitPaise);
  const boxTotal = formatPaise(opts.unitPaise * opts.addQty);
  const text = `Box · ${opts.sku} · ${opts.name} ×${opts.addQty} · ${each} ea · ${boxTotal} box${short ? ` — only ${opts.stock} of ${opts.packQty} in stock` : ""}`;
  return { text, ok: !short };
}
