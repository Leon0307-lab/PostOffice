import { PDFFont, PDFPage, rgb } from "pdf-lib";

export const COLORS = {
  yellow: rgb(0xf2 / 255, 0xc9 / 255, 0),
  anthracite: rgb(0x25 / 255, 0x28 / 255, 0x2b / 255),
  grey: rgb(0xf4 / 255, 0xf5 / 255, 0xf6 / 255),
  border: rgb(0xdc / 255, 0xdf / 255, 0xe2 / 255),
  red: rgb(0xc6 / 255, 0x28 / 255, 0x28 / 255),
  white: rgb(1, 1, 1),
  muted: rgb(0x6b / 255, 0x71 / 255, 0x76 / 255),
};

export const MM = 72 / 25.4;

/**
 * Standardschriften (WinAnsi) kennen nur Latin-1 und wenige Zeichen.
 * Andere Zeichen werden ersetzt, damit die PDF-Erzeugung nie an Sonderzeichen scheitert.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[„“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/€/g, "EUR")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^ -~ -ÿ]/gu, "?");
}

/** Text in Zeilen umbrechen (maximale Breite in Punkten). */
export function wrapText(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Sehr lange Wörter hart kürzen.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        w = w.slice(0, -1);
      }
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Text auf eine Zeile kürzen (mit Auslassungspunkten). */
export function truncate(font: PDFFont, size: number, text: string, maxWidth: number): string {
  let t = toWinAnsi(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}...`;
}

/** PostOffice-Wortmarke (eigenes Logo, kein DHL-Bestandteil). */
export function drawLogo(page: PDFPage, bold: PDFFont, x: number, y: number, size = 20): void {
  const box = size * 1.5;
  page.drawRectangle({ x, y, width: box, height: box * 0.72, color: COLORS.anthracite });
  // Briefumschlag-Klappe
  page.drawLine({
    start: { x: x + 2, y: y + box * 0.72 - 2 },
    end: { x: x + box / 2, y: y + box * 0.36 },
    thickness: 1.2,
    color: COLORS.yellow,
  });
  page.drawLine({
    start: { x: x + box - 2, y: y + box * 0.72 - 2 },
    end: { x: x + box / 2, y: y + box * 0.36 },
    thickness: 1.2,
    color: COLORS.yellow,
  });
  page.drawText("PostOffice", {
    x: x + box + 8,
    y: y + box * 0.2,
    size,
    font: bold,
    color: COLORS.anthracite,
  });
}
