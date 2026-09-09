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
import { QR_QUIET_ZONE_MODULES, qrMatrix } from "@/lib/qr";
import { THERMAL_LABEL, thermalTextBox, qrLayout } from "./boxLabel";

export type PdfLabel = {
  name?: string;
  sku: string;
  qrValue: string;
  /** Coded price e.g. A75007100051 — staff-readable, not plain ₹ */
  priceLine?: string;
  /** e.g. GRP-JS3JA8 · BOX 6 — drawn under the price code; clipped to this sticker */
  boxLine?: string;
  showName: boolean;
  showSku: boolean;
};

export { formatBoxLabelLine, thermalTextBox, THERMAL_LABEL, qrLayout, QR_SIZING } from "./boxLabel";

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

  const PW = THERMAL_LABEL.pageW, PH = THERMAL_LABEL.pageH;
  const doc = new jsPDF({ unit: "pt", format: [PW, PH], orientation: "landscape", compress: true });

  for (let i = 0; i < labels.length; i += 2) {
    if (i > 0) doc.addPage([PW, PH], "landscape");
    for (let j = 0; j < 2; j++) {
      const lab = labels[i + j];
      if (!lab) continue;
      const PAD = THERMAL_LABEL.pad;

      // Build the QR first: how many modules it needs decides both the module size and how much
      // width is left for the text. A payload the encoder cannot represent names the offending
      // SKU, instead of failing the whole batch with "Couldn't generate the labels".
      let m: boolean[][];
      try {
        m = qrMatrix(lab.qrValue);
      } catch (e: any) {
        throw new Error(`Cannot make a QR for SKU ${lab.sku}: ${e?.message || "payload too long"}. Shorten the code and try again.`);
      }
      const N = m.length;

      // Module size is FIXED (see QR_SIZING). Previously the QR was squeezed into one 54pt box,
      // so a longer SKU produced smaller, denser modules — the same sticker size but a harder
      // scan. Now the module stays constant and the square grows instead.
      const { ok, modulePt: ms, boxPt } = qrLayout(N);
      if (!ok) {
        throw new Error(
          `SKU ${lab.sku} needs a QR too dense to scan reliably on a 2in label. Shorten the SKU (or the box code) and print again.`,
        );
      }
      const { xoff, tx, maxW } = thermalTextBox(j, boxPt);

      // QR — LEFT of the label, vertically centred; white around it is the quiet zone (4 modules
      // every edge, per the spec, so thermal bleed or neighbouring text cannot eat the pattern).
      const qx = xoff + PAD + QR_QUIET_ZONE_MODULES * ms;
      const qy = (PH - boxPt) / 2 + QR_QUIET_ZONE_MODULES * ms;
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (m[r][c]) doc.rect(qx + c * ms, qy + r * ms, ms, ms, "F");
        }
      }

      // Text block — RIGHT of the QR, left-aligned, stacked name → SKU → price code.
      // Every string is clipped to maxW so it cannot paint into the next 2in sticker.
      doc.setTextColor(0, 0, 0);
      const fit = (s: string) => {
        const raw = String(s ?? "");
        // splitTextToSize breaks on hyphens, so "GRP-JS3JA8" became a lone "GRP" plus overflow
        // into the next 2in sticker. Shrink the font until the whole string fits on one line.
        let size = doc.getFontSize() as number;
        while (size > 4.2 && doc.getTextWidth(raw) > Math.max(1, maxW)) {
          size -= 0.35;
          doc.setFontSize(size);
        }
        return raw;
      };
      const isBox = Boolean(lab.boxLine);
      // Piece labels keep the original 22pt start. Box labels start higher so name + SKU +
      // price + pack line all sit inside this 1in sticker.
      let y = isBox ? 14 : 22;
      const maxBaseline = THERMAL_LABEL.maxBaseline;

      if (lab.showName && lab.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        const nameLines = isBox ? 1 : 2;
        const chunks = isBox
          ? [fit(lab.name)]
          : (doc.splitTextToSize(lab.name, Math.max(1, maxW)) as string[]).slice(0, nameLines);
        for (const ln of chunks) {
          if (y > maxBaseline) break;
          doc.text(ln, tx, y);
          y += 8;
        }
        y += isBox ? 2 : 3;
      }
      if (lab.showSku) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        if (y <= maxBaseline) doc.text(fit("SKU " + lab.sku), tx, y);
        y += isBox ? 9 : 10;
      }
      if (lab.priceLine) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9); // price code — staff decode at a glance
        if (y <= maxBaseline) doc.text(fit(lab.priceLine), tx, y);
        y += isBox ? 9 : 10;
      }
      if (lab.boxLine) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        y = Math.min(y, maxBaseline);
        doc.text(fit(lab.boxLine), tx, y);
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
