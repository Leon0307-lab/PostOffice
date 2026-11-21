import { PDFDocument, StandardFonts } from "pdf-lib";
import { barcodePng, qrPng } from "@/lib/codes";
import { qrPayload } from "@/lib/shipment-number";
import { COLORS, MM, drawLogo, toWinAnsi, truncate, wrapText } from "@/lib/pdf/common";

export interface ReceiptData {
  organizationName: string;
  shipmentNumber: string;
  senderName: string;
  recipientName: string;
  departmentName: string;
  typeLabel: string;
  methodLabel: string;
  deliveredAt: Date;
  courierName: string;
  signedRecipientName: string;
  signaturePng: Buffer;
  signatureSha256: string;
}

const TZ = "Europe/Berlin";

/** Erzeugt die PDF-Empfangsbestätigung (DIN A4, Hochformat). */
export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Empfangsbestätigung ${data.shipmentNumber}`);
  pdf.setAuthor("PostOffice");
  pdf.setProducer("PostOffice");
  pdf.setCreationDate(new Date());

  const page = pdf.addPage([210 * MM, 297 * MM]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const margin = 20 * MM;
  const innerW = width - 2 * margin;

  // Kopfband
  page.drawRectangle({ x: 0, y: height - 34 * MM, width, height: 34 * MM, color: COLORS.yellow });
  drawLogo(page, bold, margin, height - 25 * MM, 22);
  page.drawText("EMPFANGSBESTÄTIGUNG", {
    x: margin,
    y: height - 31 * MM + 2,
    size: 9,
    font: bold,
    color: COLORS.anthracite,
  });
  page.drawText(truncate(font, 9, data.organizationName, innerW / 2), {
    x: width - margin - Math.min(font.widthOfTextAtSize(toWinAnsi(data.organizationName), 9), innerW / 2),
    y: height - 14 * MM,
    size: 9,
    font,
    color: COLORS.anthracite,
  });

  // Sendungsnummer groß + Codes
  let y = height - 50 * MM;
  page.drawText("Sendungsnummer", { x: margin, y, size: 9, font, color: COLORS.muted });
  y -= 24;
  page.drawText(toWinAnsi(data.shipmentNumber), {
    x: margin,
    y,
    size: 28,
    font: bold,
    color: COLORS.anthracite,
  });

  const barcode = await pdf.embedPng(await barcodePng(data.shipmentNumber, 4, 14));
  const barW = 80 * MM;
  const barH = (barcode.height / barcode.width) * barW;
  page.drawImage(barcode, { x: margin, y: y - 16 - barH, width: barW, height: barH });

  const qr = await pdf.embedPng(await qrPng(qrPayload(data.shipmentNumber), 5));
  const qrSize = 30 * MM;
  page.drawImage(qr, {
    x: width - margin - qrSize,
    y: height - 50 * MM - qrSize + 6,
    width: qrSize,
    height: qrSize,
  });

  // Datentabelle
  y = y - 16 - barH - 22;
  const rows: Array<[string, string]> = [
    ["Absender", data.senderName],
    ["Empfänger", data.recipientName],
    ["Abteilung", data.departmentName || "-"],
    ["Sendungsart", data.typeLabel],
    ["Versandart", data.methodLabel],
    [
      "Zustelldatum",
      new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "long" }).format(data.deliveredAt),
    ],
    [
      "Zustellzeit",
      `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, timeStyle: "medium" }).format(data.deliveredAt)} Uhr`,
    ],
    ["Zusteller", data.courierName || "-"],
    ["Name des Empfängers", data.signedRecipientName],
  ];
  const labelW = 48 * MM;
  const rowH = 20;
  rows.forEach(([label, value], i) => {
    const top = y - i * rowH;
    if (i % 2 === 0) {
      page.drawRectangle({ x: margin, y: top - rowH + 5, width: innerW, height: rowH, color: COLORS.grey });
    }
    page.drawText(toWinAnsi(label), { x: margin + 6, y: top - 10, size: 9, font, color: COLORS.muted });
    page.drawText(truncate(bold, 11, value, innerW - labelW - 12), {
      x: margin + labelW,
      y: top - 10,
      size: 11,
      font: bold,
      color: COLORS.anthracite,
    });
  });

  // Unterschrift
  const sigTop = y - rows.length * rowH - 24;
  page.drawText("Digitale Unterschrift des Empfängers", {
    x: margin,
    y: sigTop,
    size: 9,
    font,
    color: COLORS.muted,
  });
  const boxH = 48 * MM;
  const boxY = sigTop - 8 - boxH;
  page.drawRectangle({
    x: margin,
    y: boxY,
    width: innerW,
    height: boxH,
    borderColor: COLORS.border,
    borderWidth: 1,
    color: COLORS.white,
  });
  const sig = await pdf.embedPng(data.signaturePng);
  const maxSigW = innerW - 16;
  const maxSigH = boxH - 16;
  const scale = Math.min(maxSigW / sig.width, maxSigH / sig.height);
  const sigW = sig.width * scale;
  const sigH = sig.height * scale;
  page.drawImage(sig, {
    x: margin + (innerW - sigW) / 2,
    y: boxY + (boxH - sigH) / 2,
    width: sigW,
    height: sigH,
  });

  // Hinweis und Integrität
  const noteLines = wrapText(
    font,
    8,
    "Diese Empfangsbestätigung wurde automatisch durch PostOffice nach erfolgreicher Zustellung erstellt. " +
      "Die Unterschrift wurde digital auf einem Touchscreen erfasst und revisionssicher gespeichert.",
    innerW
  );
  let ny = boxY - 18;
  for (const line of noteLines) {
    page.drawText(line, { x: margin, y: ny, size: 8, font, color: COLORS.muted });
    ny -= 11;
  }
  page.drawText(`Unterschrift SHA-256: ${data.signatureSha256.slice(0, 32)}...`, {
    x: margin,
    y: ny - 4,
    size: 7,
    font: mono,
    color: COLORS.muted,
  });

  // Fußzeile
  page.drawRectangle({ x: 0, y: 0, width, height: 8 * MM, color: COLORS.anthracite });
  page.drawText(
    toWinAnsi(
      `PostOffice - Empfangsbestätigung ${data.shipmentNumber} - erstellt am ${new Intl.DateTimeFormat("de-DE", {
        timeZone: TZ,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date())}`
    ),
    { x: margin, y: 3 * MM, size: 8, font, color: COLORS.white }
  );

  return pdf.save();
}
