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
  return null;
}

/** How many piece units a box scan should add. Oversell bills the full pack even if stock is 0. */
export function groupUnitsToAdd(packQty: number, stockQty: number, alreadyInBill = 0, allowOversell = false): number {
  const pack = Math.max(0, Math.floor(Number(packQty) || 0));
  if (allowOversell) return pack;
  const remaining = Math.max(0, Math.floor(Number(stockQty) || 0) - Math.max(0, Math.floor(Number(alreadyInBill) || 0)));
  return Math.min(pack, remaining);
}
