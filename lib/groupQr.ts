/** Normalize QR payloads printed for inventory groups (raw code or `/g/<code>` URL). */
export function groupCodeFromScan(raw: string): string | null {
  const value = (raw ?? "").trim();
  const match = value.match(/\/g\/([A-Za-z0-9%._-]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]).toUpperCase(); }
    catch { return match[1].toUpperCase(); }
  }
  if (/^GRP-[A-Za-z0-9]+$/i.test(value)) return value.toUpperCase();
  return null;
}

/** Limit a group scan to stock not already reserved by the current POS bill. */
export function groupUnitsToAdd(packQty: number, stockQty: number, alreadyInBill = 0): number {
  const pack = Math.max(0, Math.floor(Number(packQty) || 0));
  const remaining = Math.max(0, Math.floor(Number(stockQty) || 0) - Math.max(0, Math.floor(Number(alreadyInBill) || 0)));
  return Math.min(pack, remaining);
}
