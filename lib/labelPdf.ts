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
  /** Coded price e.g. A75007100051 — staff-readable, not plain ₹ */
  priceLine?: string;
  /** e.g. BOX OF 6 — drawn under the price code when present */
  boxLine?: string;
  showName: boolean;
  showSku: boolean;
};

// jsPDF is loaded on demand (only when the owner prints/saves) so it adds no weight to the main
// bundle. It's SELF-HOSTED from /public — a same-origin script — so it works even when the shop's
// network/firewall blocks public CDNs (which is what broke the cdnjs version).
const JSPDF_URL = "/vendor/jspdf.umd.min.js";
async function loadJsPdf(): Promise<any> {
  const w = window as any;
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSPDF_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the PDF library. Reload the page and try again."));
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
      const PAD = 6;

      // QR — LEFT of the label, vertically centred; white around it is the quiet zone.
      const m = qrMatrix(lab.qrValue);
      const N = m.length;
      const QR = 54;                       // ~19mm — big and very scannable
      const ms = QR / N;
      const qx = xoff + PAD;
      const qy = (PH - QR) / 2;            // centred in the 72pt-tall label
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (m[r][c]) doc.rect(qx + c * ms, qy + r * ms, ms, ms, "F");
        }
      }

      // Text block — RIGHT of the QR, left-aligned, stacked name → SKU → price code.
      const tx = xoff + PAD + QR + 8;
      const maxW = xoff + HALF - PAD - tx;  // remaining width for text
      doc.setTextColor(0, 0, 0);
      // Box labels reserve room for the pack line and use a single-line product name. This
      // prevents any text from crossing into the next 1in label, even with long product names.
      const compactBoxLabel = !!lab.boxLine;
      let y = compactBoxLabel ? 17 : 13;
      if (lab.showName && lab.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        const lines = (doc.splitTextToSize(lab.name, maxW) as string[]).slice(0, compactBoxLabel ? 1 : 2);
        for (const ln of lines) { doc.text(ln, tx, y); y += 8; }
        y += compactBoxLabel ? 2 : 3;
      }
      if (lab.showSku) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text("SKU " + lab.sku, tx, y);
        y += 10;
      }
      if (lab.priceLine) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9); // price code — staff decode at a glance
        doc.text(lab.priceLine, tx, y);
        y += 10;
      }
      if (lab.boxLine) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(lab.boxLine, tx, y);
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
