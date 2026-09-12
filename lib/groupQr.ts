import { normalizeScanPayload } from "./scan";

/**
 * What a box/group QR scan means.
 *
 * Two sticker generations are on the shelves at once:
 *   BOX:<pieceSku>:<packQty>  — first 15 boxes (late Aug 2026), e.g. BOX:AJDH1931:12
 *   GRP-XXXXXX                — later labels
 *
 * The BOX: payload is self-contained (SKU + how many sit in the box). POS must treat it as a
 * pack scan even if the inventory_groups row was later archived or recreated as GRP-….
 */
export type ParsedGroupScan =
  | { kind: "box"; sku: string; packQty: number; code: string }
  | { kind: "grp"; code: string };

function tryDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Canonical BOX:SKU:N from a raw scan. Accepts colon or semicolon (HID wedges that drop Shift). */
function boxPayloadFrom(text: string): { sku: string; packQty: number; code: string } | null {
  const m = String(text ?? "").match(/BOX[:;]([^:;\s]+)[:;](\d+)/i);
  if (!m) return null;
  const sku = m[1].trim();
  const packQty = Math.floor(Number(m[2]));
  if (!sku || packQty < 1) return null;
  return { sku, packQty, code: `BOX:${sku.toUpperCase()}:${packQty}` };
}

function grpCodeFrom(text: string): string | null {
  const s = String(text ?? "").trim();
  if (/^GRP-[A-Za-z0-9]+$/i.test(s)) return s.toUpperCase();
  // Some wedges drop the hyphen: GRPAB12CD → GRP-AB12CD (stored form).
  const glued = s.match(/^GRP([A-Za-z0-9]{4,})$/i);
  if (glued) return `GRP-${glued[1].toUpperCase()}`;
  const embedded = s.match(/GRP-[A-Za-z0-9]+/i);
  if (embedded) return embedded[0].toUpperCase();
  return null;
}

/** Parse a scanned string into a box payload or a GRP- code. Piece SKUs return null. */
export function parseGroupScan(raw: string): ParsedGroupScan | null {
  const value = normalizeScanPayload(raw ?? "");
  if (!value) return null;
  const decoded = tryDecode(value);

  // BOX: first — `/g/BOX:AJDH1931:12` must not be truncated at the colon (the old /g/ charset
  // stopped at BOX and POS then searched for a product named "BOX").
  const box = boxPayloadFrom(decoded) ?? boxPayloadFrom(value);
  if (box) return { kind: "box", ...box };

  const path = decoded.match(/\/g\/([A-Za-z0-9%._:-]+)/i) ?? value.match(/\/g\/([A-Za-z0-9%._:-]+)/i);
  if (path) {
    const body = tryDecode(path[1]).toUpperCase();
    const boxInPath = boxPayloadFrom(body);
    if (boxInPath) return { kind: "box", ...boxInPath };
    const grp = grpCodeFrom(body);
    if (grp) return { kind: "grp", code: grp };
    if (body) return { kind: "grp", code: body };
  }

  const grp = grpCodeFrom(decoded) ?? grpCodeFrom(value);
  if (grp) return { kind: "grp", code: grp };
  return null;
}

/** Normalize QR payloads printed for inventory groups (raw code, `/g/<code>` URL, or BOX:sku:qty). */
export function groupCodeFromScan(raw: string): string | null {
  return parseGroupScan(raw)?.code ?? null;
}

/** How many piece units a box scan should add. Oversell bills the full pack even if stock is 0. */
export function groupUnitsToAdd(packQty: number, stockQty: number, alreadyInBill = 0, allowOversell = false): number {
  const pack = Math.max(0, Math.floor(Number(packQty) || 0));
  if (allowOversell) return pack;
  const remaining = Math.max(0, Math.floor(Number(stockQty) || 0) - Math.max(0, Math.floor(Number(alreadyInBill) || 0)));
  return Math.min(pack, remaining);
}
