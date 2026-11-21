import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { buildLabelsPdf, cellOrigin, LABELS_PER_PAGE, type LabelData } from "@/lib/pdf/labels";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { toWinAnsi } from "@/lib/pdf/common";

const label = (n: number, confidential = false): LabelData => ({
  shipmentNumber: `PO-2026-${String(n).padStart(6, "0")}`,
  senderName: "Firma Müller & Söhne GmbH",
  recipientName: "Erika Mustermann",
  departmentName: "Buchhaltung",
  locationText: "Gebäude A, Etage 2, Raum 204",
  priorityLabel: "Dringend",
  priority: "dringend",
  confidential,
});

function signaturePng(): Buffer {
  const png = new PNG({ width: 300, height: 100 });
  png.data.fill(255);
  for (let x = 10; x < 290; x++) {
    const i = (300 * 50 + x) << 2;
    png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0;
  }
  return PNG.sync.write(png);
}

describe("Etikettengenerator", () => {
  it("DIN A4, 8 Etiketten pro Seite", async () => {
    const bytes = await buildLabelsPdf(Array.from({ length: 9 }, (_, i) => label(i + 1)), "sheet");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("Einzeletikett: nur ein Etikett, Position wählbar", async () => {
    const bytes = await buildLabelsPdf([label(1), label(2)], "single", 5);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("Rasterpositionen liegen innerhalb der Seite", () => {
    for (let p = 1; p <= LABELS_PER_PAGE; p++) {
      const { x, y } = cellOrigin(p);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it("verarbeitet Sonderzeichen und vertrauliche Sendungen", async () => {
    const bytes = await buildLabelsPdf([label(7, true)], "single");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("wirft bei leerer Liste", async () => {
    await expect(buildLabelsPdf([], "sheet")).rejects.toThrow();
  });
});

describe("Empfangsbestätigung", () => {
  it("erzeugt eine einseitige PDF mit Unterschrift", async () => {
    const bytes = await buildReceiptPdf({
      organizationName: "Beispiel AG",
      shipmentNumber: "PO-2026-000001",
      senderName: "Absender",
      recipientName: "Empfänger",
      departmentName: "IT",
      typeLabel: "Paket",
      methodLabel: "Hauspost",
      deliveredAt: new Date("2026-03-01T10:15:00Z"),
      courierName: "Zusteller Z",
      signedRecipientName: "Empfänger",
      signaturePng: signaturePng(),
      signatureSha256: "a".repeat(64),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe("PDF-Textbereinigung", () => {
  it("ersetzt nicht darstellbare Zeichen statt abzustürzen", () => {
    expect(toWinAnsi("Müller – „Test“ € 😀")).toBe('Müller - "Test" EUR ?');
  });
});
