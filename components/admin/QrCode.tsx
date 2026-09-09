import { QR_QUIET_ZONE_MODULES, qrMatrix, qrPath } from "@/lib/qr";

/** Renders a QR code for `value` as inline SVG (print-safe, no dependencies) — the 2D
 *  counterpart of <Barcode/>. Phones and 2D scanners read it natively; error correction
 *  keeps small smudged stickers scannable. */
export function QrCode({ value, size = 48 }: { value: string; size?: number }) {
  let path: { d: string; size: number };
  try { path = qrPath(qrMatrix(value)); } catch { return null; }
  const box = path.size + QR_QUIET_ZONE_MODULES * 2;
  return (
    <svg width="100%" height={size} viewBox={`${-QR_QUIET_ZONE_MODULES} ${-QR_QUIET_ZONE_MODULES} ${box} ${box}`}
      preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges">
      <path d={path.d} fill="#000" />
    </svg>
  );
}
