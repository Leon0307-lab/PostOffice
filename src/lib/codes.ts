import bwipjs from "bwip-js/node";

/** Code-128-Barcode als PNG (ohne Klartext, wird separat gesetzt). */
export async function barcodePng(text: string, scale = 3, height = 12): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale,
    height,
    includetext: false,
    paddingwidth: 2,
    paddingheight: 2,
    backgroundcolor: "FFFFFF",
  });
}

/** QR-Code als PNG. */
export async function qrPng(text: string, scale = 4): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    scale,
    eclevel: "M",
    paddingwidth: 2,
    paddingheight: 2,
    backgroundcolor: "FFFFFF",
  });
}

export function pngDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
