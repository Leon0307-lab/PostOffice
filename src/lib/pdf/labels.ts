import { PDFDocument, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import { barcodePng, qrPng } from "@/lib/codes";
import { qrPayload } from "@/lib/shipment-number";
import { COLORS, MM, toWinAnsi, truncate } from "@/lib/pdf/common";

export interface LabelData {
  shipmentNumber: string;
  senderName: string;
  recipientName: string;
  departmentName: string;
  locationText: string;
  priorityLabel: string;
  priority: "niedrig" | "normal" | "hoch" | "dringend";
  confidential: boolean;
}

export type LabelMode = "sheet" | "single";

/** Raster: 2 Spalten x 4 Zeilen, Etikettengröße 105 x 74,25 mm (8 pro DIN-A4-Seite). */
export const LABEL_COLUMNS = 2;
export const LABEL_ROWS = 4;
export const LABELS_PER_PAGE = LABEL_COLUMNS * LABEL_ROWS;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const CELL_W = PAGE_W / LABEL_COLUMNS;
const CELL_H = PAGE_H / LABEL_ROWS;

/** Position (1-8) -> Spalte/Zeile; Zählung zeilenweise von links oben. */
export function cellOrigin(position: number): { x: number; y: number } {
  const idx = Math.min(Math.max(position, 1), LABELS_PER_PAGE) - 1;
  const col = idx % LABEL_COLUMNS;
  const row = Math.floor(idx / LABEL_COLUMNS);
  return { x: col * CELL_W, y: PAGE_H - (row + 1) * CELL_H };
}

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
}

function drawLabel(
  page: PDFPage,
  fonts: Fonts,
  data: LabelData,
  barcode: PDFImage,
  qr: PDFImage,
  position: number
): void {
  const { font, bold } = fonts;
  const { x: x0, y: y0 } = cellOrigin(position);
  const pad = 14;
  const innerW = CELL_W - 2 * pad;
  const left = x0 + pad;
  const top = y0 + CELL_H - pad;

  // Schnittmarken (dünn, gestrichelt wirkend)
  page.drawRectangle({
    x: x0 + 2,
    y: y0 + 2,
    width: CELL_W - 4,
    height: CELL_H - 4,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  // Kopfzeile
  page.drawRectangle({ x: left, y: top - 16, width: innerW, height: 16, color: COLORS.yellow });
  page.drawText("PostOffice", { x: left + 5, y: top - 12, size: 9, font: bold, color: COLORS.anthracite });
  const prio = `Priorität: ${data.priorityLabel}`;
  const prioW = bold.widthOfTextAtSize(toWinAnsi(prio), 8);
  page.drawText(toWinAnsi(prio), {
    x: left + innerW - prioW - 5,
    y: top - 12,
    size: 8,
    font: bold,
    color: data.priority === "dringend" ? COLORS.red : COLORS.anthracite,
  });

  // Sendungsnummer
  page.drawText(toWinAnsi(data.shipmentNumber), {
    x: left,
    y: top - 38,
    size: 18,
    font: bold,
    color: COLORS.anthracite,
  });

  // Barcode links, QR rechts
  const barW = innerW - 70;
  const barH = Math.min(34, (barcode.height / barcode.width) * barW);
  page.drawImage(barcode, { x: left, y: top - 46 - barH, width: barW, height: barH });
  const qrSize = 58;
  page.drawImage(qr, { x: left + innerW - qrSize, y: top - 44 - qrSize + 4, width: qrSize, height: qrSize });

  // Adressdaten
  let y = top - 112;
  const textW = innerW;
  page.drawText("An:", { x: left, y, size: 8, font, color: COLORS.muted });
  page.drawText(truncate(bold, 11, data.recipientName, textW - 24), {
    x: left + 24,
    y,
    size: 11,
    font: bold,
    color: COLORS.anthracite,
  });
  y -= 12;
  page.drawText("Abt.:", { x: left, y, size: 8, font, color: COLORS.muted });
  page.drawText(truncate(font, 9, data.departmentName || "-", textW - 24), {
    x: left + 24,
    y,
    size: 9,
    font,
    color: COLORS.anthracite,
  });
  y -= 11;
  page.drawText("Ort:", { x: left, y, size: 8, font, color: COLORS.muted });
  page.drawText(truncate(font, 9, data.locationText || "-", textW - 24), {
    x: left + 24,
    y,
    size: 9,
    font,
    color: COLORS.anthracite,
  });
  y -= 11;
  page.drawText("Von:", { x: left, y, size: 8, font, color: COLORS.muted });
  page.drawText(truncate(font, 9, data.senderName, textW - 24), {
    x: left + 24,
    y,
    size: 9,
    font,
    color: COLORS.anthracite,
  });

  // Vertraulichkeitskennzeichnung
  if (data.confidential) {
    page.drawRectangle({
      x: left,
      y: y0 + pad,
      width: innerW,
      height: 18,
      color: COLORS.anthracite,
    });
    page.drawText("VERTRAULICH - NUR PERSÖNLICH AUSHÄNDIGEN", {
      x: left + 6,
      y: y0 + pad + 5,
      size: 8.5,
      font: bold,
      color: COLORS.yellow,
    });
  }
}

/**
 * Erzeugt ein DIN-A4-PDF mit Etiketten.
 * - mode "sheet": alle Etiketten nacheinander, 8 pro Seite
 * - mode "single": nur das erste Etikett, an Rasterposition `position` (1-8),
 *   damit angebrochene Etikettenbögen weiterverwendet werden können
 */
export async function buildLabelsPdf(
  labels: LabelData[],
  mode: LabelMode,
  position = 1
): Promise<Uint8Array> {
  if (labels.length === 0) throw new Error("Keine Etiketten angegeben.");

  const pdf = await PDFDocument.create();
  pdf.setTitle("PostOffice Versandetiketten");
  pdf.setProducer("PostOffice");
  const fonts: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const items = mode === "single" ? labels.slice(0, 1) : labels;
  const startIndex = mode === "single" ? Math.min(Math.max(position, 1), LABELS_PER_PAGE) - 1 : 0;

  let page: PDFPage | null = null;
  for (let i = 0; i < items.length; i++) {
    const slot = (startIndex + i) % LABELS_PER_PAGE;
    if (page === null || slot === 0) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
    }
    const data = items[i];
    const barcode = await pdf.embedPng(await barcodePng(data.shipmentNumber, 3, 10));
    const qr = await pdf.embedPng(await qrPng(qrPayload(data.shipmentNumber), 4));
    drawLabel(page, fonts, data, barcode, qr, slot + 1);
  }

  return pdf.save();
}
