import { barcodePng, pngDataUri, qrPng } from "@/lib/codes";
import { qrPayload } from "@/lib/shipment-number";

/** Serverkomponente: erzeugt Barcode (Code 128) und/oder QR-Code als eingebettetes Bild. */
export async function BarcodeImage({ value, className = "" }: { value: string; className?: string }) {
  const png = await barcodePng(value, 3, 12);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pngDataUri(png)}
      alt={`Barcode ${value}`}
      className={`h-16 w-auto max-w-full ${className}`}
    />
  );
}

export async function QrImage({ value, size = 96 }: { value: string; size?: number }) {
  const png = await qrPng(qrPayload(value), 4);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={pngDataUri(png)} alt={`QR-Code ${value}`} width={size} height={size} />
  );
}
