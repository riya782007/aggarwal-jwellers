import { normalizeScanPayload } from "./scan";

/** Normalize QR payloads printed for inventory groups (raw code or `/g/<code>` URL). */
export function groupCodeFromScan(raw: string): string | null {
  const value = normalizeScanPayload(raw ?? "");
  const match = value.match(/\/g\/([A-Za-z0-9%._-]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]).toUpperCase(); }
    catch { return match[1].toUpperCase(); }
  }
  if (/^GRP-[A-Za-z0-9]+$/i.test(value)) return value.toUpperCase();
  // Some wedges drop the hyphen: GRPAB12CD → GRP-AB12CD (stored form).
  const glued = value.match(/^GRP([A-Za-z0-9]{4,})$/i);
  if (glued) return `GRP-${glued[1].toUpperCase()}`;

  /**
   * LEGACY BOX PAYLOAD — `BOX:<sku>:<packQty>`, e.g. `BOX:AJDH1934:12`.
   *
   * Sept 2026, owner: a box QR scanned at the counter answered `No product "BOX:AJDH1934:12"`.
   *
   * The sticker was never wrong and neither was the database — inventory_groups holds a row whose
   * `code` is LITERALLY that string, status active, pack_qty 12. The gap was here: the first 15 box
   * QRs (24 Aug 2026, 11:08–11:25) were created before the GRP- scheme existed, and this function
   * only ever learned the GRP- shapes. Returning null made POSClient skip its whole box branch
   * (`const groupCode = groupCodeFromScan(source); if (groupCode) { …box… }`) and fall through to the
   * ordinary product search, which of course has no product called "BOX:AJDH1934:12".
   *
   * Those 15 stickers are stuck on real boxes on his shelves — they cannot be recalled and reprinted,
   * so the software has to keep understanding them. The payload IS the stored code, so it is returned
   * as-is (upper-cased; the lookup is ilike and colons are not escaped by escapeIlikeExact, so it
   * matches the row exactly).
   *
   * Verified against all 15 live codes: BOX:AJDH261:12 … BOX:AJDH1937:12.
   * The SKU part allows dots because this catalogue has SKUs like BAJDJ.PIN13.
   */
  if (/^BOX:[A-Za-z0-9._-]+:\d+$/i.test(value)) return value.toUpperCase();

  return null;
}

/** How many piece units a box scan should add. Oversell bills the full pack even if stock is 0. */
export function groupUnitsToAdd(packQty: number, stockQty: number, alreadyInBill = 0, allowOversell = false): number {
  const pack = Math.max(0, Math.floor(Number(packQty) || 0));
  if (allowOversell) return pack;
  const remaining = Math.max(0, Math.floor(Number(stockQty) || 0) - Math.max(0, Math.floor(Number(alreadyInBill) || 0)));
  return Math.min(pack, remaining);
}
