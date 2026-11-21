import { createHash } from "crypto";
import { PNG } from "pngjs";
import { MAX_SIGNATURE_BYTES } from "@/lib/constants";

export interface ValidatedSignature {
  buffer: Buffer;
  sha256: string;
  width: number;
  height: number;
  inkPixels: number;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PREFIX = "data:image/png;base64,";

/** Mindestanzahl sichtbarer (nicht transparenter, nicht weißer) Pixel für eine gültige Unterschrift. */
export const MIN_INK_PIXELS = 150;

export class SignatureError extends Error {}

/**
 * Prüft eine vom Browser gesendete Unterschrift (PNG als Data-URL) serverseitig:
 * Format, Größe, echte PNG-Struktur und tatsächlich vorhandene Tinte.
 * Die clientseitige Prüfung ist nur Komfort, nie Sicherheit.
 */
export function validateSignatureDataUrl(dataUrl: string): ValidatedSignature {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new SignatureError("Unterschrift hat ein ungültiges Format.");
  }
  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new SignatureError("Unterschrift ist beschädigt.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_SIGNATURE_BYTES) {
    throw new SignatureError("Unterschrift ist zu groß oder leer.");
  }
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new SignatureError("Unterschrift ist kein gültiges PNG.");
  }

  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch {
    throw new SignatureError("Unterschrift konnte nicht gelesen werden.");
  }
  if (png.width < 100 || png.height < 40 || png.width > 2400 || png.height > 1200) {
    throw new SignatureError("Unterschrift hat unzulässige Abmessungen.");
  }

  let ink = 0;
  const data = png.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 40) continue;
    const isNearWhite = data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240;
    if (!isNearWhite) ink++;
  }
  if (ink < MIN_INK_PIXELS) {
    throw new SignatureError("Bitte unterschreiben: Die Unterschrift ist leer oder zu kurz.");
  }

  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width: png.width,
    height: png.height,
    inkPixels: ink,
  };
}
