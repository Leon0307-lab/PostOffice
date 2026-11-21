/** Format der Sendungsnummer: PO-JJJJ-NNNNNN, z. B. PO-2026-000001 */
export const SHIPMENT_NUMBER_REGEX = /^PO-\d{4}-\d{6}$/;
const SHIPMENT_NUMBER_IN_TEXT = /PO-\d{4}-\d{6}/i;

export function isValidShipmentNumber(value: string): boolean {
  return SHIPMENT_NUMBER_REGEX.test(value);
}

/**
 * Extrahiert eine Sendungsnummer aus Scanner-/Tastatureingaben.
 * Akzeptiert die reine Nummer, Groß-/Kleinschreibung, Leerzeichen sowie
 * URLs oder Texte, die eine Nummer enthalten (z. B. aus QR-Codes).
 * Gibt null zurück, wenn keine gültige Nummer enthalten ist.
 */
export function parseScanInput(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  const match = trimmed.match(SHIPMENT_NUMBER_IN_TEXT);
  if (!match) return null;
  return match[0].toUpperCase();
}

/** Baut den QR-Inhalt (nur die Nummer, damit Scanner robust bleiben). */
export function qrPayload(shipmentNumber: string): string {
  return shipmentNumber;
}
