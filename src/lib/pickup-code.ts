import { createHmac, randomInt } from "crypto";

/** Zeichenvorrat ohne verwechselbare Zeichen (kein 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Erzeugt einen kryptografisch zufälligen Abholcode, z. B. "K7QM-4TZ9". */
export function generatePickupCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Eingabe normalisieren: Groß-/Kleinschreibung, Leerzeichen und Bindestriche ignorieren. */
export function normalizePickupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isPlausiblePickupCode(input: string): boolean {
  const n = normalizePickupCode(input);
  return n.length === CODE_LENGTH && [...n].every((c) => ALPHABET.includes(c));
}

/**
 * HMAC-SHA256 mit serverseitigem Geheimnis (PICKUP_CODE_PEPPER).
 * In der Datenbank steht ausschließlich dieser Hash, nie der Klartext.
 */
export function hashPickupCode(code: string, pepper: string): string {
  if (!pepper || pepper.length < 16) {
    throw new Error("PICKUP_CODE_PEPPER fehlt oder ist zu kurz.");
  }
  return createHmac("sha256", pepper).update(normalizePickupCode(code)).digest("hex");
}

export function getPepper(): string {
  const pepper = process.env.PICKUP_CODE_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error("PICKUP_CODE_PEPPER ist nicht (ausreichend lang) konfiguriert.");
  }
  return pepper;
}
