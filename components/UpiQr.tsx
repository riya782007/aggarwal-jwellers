import { qrMatrix, qrPath } from "@/lib/qr";
import { BUSINESS } from "@/lib/business";

/** Scan-to-pay UPI QR for an exact amount (uses our verified lib/qr encoder).
 *  Renders nothing when no VPA is configured (BUSINESS_UPI_VPA env). */
export function UpiQr({ amountPaise, note, size = 132, vpa: vpaProp }: { amountPaise: number; note?: string; size?: number; vpa?: string }) {
  // `vpa` can be passed explicitly (needed inside client components, where the server-only
  // BUSINESS_UPI_VPA env isn't readable); otherwise fall back to the server-side config.
  const vpa = (vpaProp ?? BUSINESS.bank.upi)?.trim();
  if (!vpa || amountPaise <= 0) return null;
  const amount = (amountPaise / 100).toFixed(2);
  // Keep the payload MINIMAL — pa + pn + am only. Our QR encoder tops out at 84 bytes (versions
  // 1–5); adding cu=INR and a tn note pushed real UPI URLs to ~100 bytes, which threw and rendered
  // a BLANK QR. UPI defaults the currency to INR, and the order reference is captured separately
  // from the dealer, so both are safe to omit. (`note` is accepted for compatibility but unused.)
  const url = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(BUSINESS.brand)}&am=${amount}`;
  void note;
  let path: { d: string; size: number };
  try { path = qrPath(qrMatrix(url)); } catch { return null; }
  const QUIET = 2; const box = path.size + QUIET * 2;
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`} shapeRendering="crispEdges" className="rounded-lg bg-white p-1 border border-sand">
        <path d={path.d} fill="#000" />
      </svg>
      <span className="text-[10px] text-muted">Scan to pay ₹{amount} · {vpa}</span>
    </div>
  );
}
