import { encodeQr, type EccLevel } from "@/lib/qr";

/**
 * Renders a QR code for `value` as inline SVG (print-safe, zero dependencies).
 * Works on the server and client — the encoder in lib/qr.ts is pure TypeScript.
 */
export function QRCode({ value, size = 96, margin = 2, ecc = "M" }: { value: string; size?: number; margin?: number; ecc?: EccLevel }) {
  let modules: boolean[][];
  let n: number;
  try {
    const res = encodeQr(value, ecc);
    modules = res.modules;
    n = res.size;
  } catch {
    // Payload too large for v1–6 — render nothing rather than break the page.
    return <svg width={size} height={size} viewBox="0 0 1 1" aria-label="QR unavailable" />;
  }
  const dim = n + margin * 2;
  const rects: JSX.Element[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) rects.push(<rect key={`${r}-${c}`} x={c + margin} y={r + margin} width={1} height={1} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${value}`}>
      <rect width={dim} height={dim} fill="#fff" />
      <g fill="#000">{rects}</g>
    </svg>
  );
}
