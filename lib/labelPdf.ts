/**
 * lib/labelPdf.ts — exact-size label PDF for the thermal roll (client-only).
 *
 * Why a PDF: printing HTML to a thermal printer lets the browser + driver rescale/rotate the
 * page ("fit to page"), which shrank and turned our labels sideways. A PDF carries its own hard
 * page geometry, so when the user picks "Actual size" the printer lays each label 1:1. Page =
 * 4in × 1in (the full 2-up web); two 2in × 1in stickers per page. QR is drawn as vector squares
 * from the same qrMatrix the on-screen label uses, so what scans on screen scans on paper.
 *
 * Points: PDF unit is 1/72 inch. 1in = 72pt, so 4in = 288pt, 2in = 144pt, 1in tall = 72pt.
 */
import { qrMatrix } from "@/lib/qr";

export type PdfLabel = {
  name?: string;
  sku: string;
  qrValue: string;
  priceLine?: string;
  showName: boolean;
  showSku: boolean;
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// jsPDF is loaded on demand from the CDN (only when the owner clicks Download PDF) so it adds
// no bundle weight and no npm dependency to keep in sync. cdnjs is already used elsewhere.
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";
async function loadJsPdf(): Promise<any> {
  const w = window as any;
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSPDF_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the PDF library — check your internet connection."));
    document.head.appendChild(s);
  });
  if (!w.jspdf?.jsPDF) throw new Error("PDF library failed to initialise.");
  return w.jspdf.jsPDF;
}

/**
 * action="print"  → open the PDF in a new tab and auto-trigger the print dialog (no save step).
 * action="download" → save the file to disk.
 * The exact-size PDF is the same either way; "print" is the everyday one-click path.
 */
export async function makeLabelsPdf(labels: PdfLabel[], action: "print" | "download" = "print"): Promise<void> {
  if (labels.length === 0) return;
  const jsPDF = await loadJsPdf();

  const PW = 288, PH = 72, HALF = 144; // 4in × 1in page; each label 2in × 1in
  const doc = new jsPDF({ unit: "pt", format: [PW, PH], orientation: "landscape", compress: true });

  for (let i = 0; i < labels.length; i += 2) {
    if (i > 0) doc.addPage([PW, PH], "landscape");
    for (let j = 0; j < 2; j++) {
      const lab = labels[i + j];
      if (!lab) continue;
      const xoff = j * HALF;
      const cx = xoff + HALF / 2;

      // Product name (top, centred)
      if (lab.showName && lab.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.text(clip(lab.name, 34), cx, 11, { align: "center" });
      }

      // QR — vector squares, centred; the white label provides the quiet zone
      const m = qrMatrix(lab.qrValue);
      const N = m.length;
      const QR = 34;                 // ~12mm — comfortably scannable
      const ms = QR / N;
      const qx = xoff + (HALF - QR) / 2;
      const qy = 14;
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (m[r][c]) doc.rect(qx + c * ms, qy + r * ms, ms, ms, "F");
        }
      }

      // SKU + price code (below the QR)
      let ty = qy + QR + 8;
      doc.setFont("helvetica", "normal");
      if (lab.showSku) {
        doc.setFontSize(6);
        doc.text("SKU " + lab.sku, cx, ty, { align: "center" });
        ty += 8;
      }
      if (lab.priceLine) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(lab.priceLine, cx, ty, { align: "center" });
      }
    }
  }

  if (action === "download") {
    doc.save("aggarwal-labels.pdf");
    return;
  }
  // One-click print: embed an auto-print action and open the PDF in a new tab, where the browser
  // pops the print dialog straight away — no "download then open" round-trip.
  doc.autoPrint();
  const url = doc.output("bloburl");
  const win = window.open(url as any, "_blank");
  if (!win) {
    // Popup blocked → fall back to a normal download so the labels are never lost.
    doc.save("aggarwal-labels.pdf");
  }
}
