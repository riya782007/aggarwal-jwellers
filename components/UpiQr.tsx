import { qrMatrix, qrPath } from "@/lib/qr";
import { BUSINESS } from "@/lib/business";

/** Scan-to-pay UPI QR for an exact amount (uses our verified lib/qr encoder).
 *  Renders nothing when no VPA is configured (BUSINESS_UPI_VPA env). */
export function UpiQr({ amountPaise, note, size = 132 }: { amountPaise: number; note?: string; size?: number }) {
  const vpa = BUSINESS.bank.upi;
  if (!vpa || amountPaise <= 0) return null;
  const amount = (amountPaise / 100).toFixed(2);
  const url = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(BUSINESS.brand)}&am=${amount}&cu=INR${note ? `&tn=${encodeURIComponent(note.slice(0, 40))}` : ""}`;
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
