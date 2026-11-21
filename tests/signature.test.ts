import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { SignatureError, validateSignatureDataUrl } from "@/lib/signature";

function makePng(width: number, height: number, drawInk: (png: PNG) => void): string {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }
  drawInk(png);
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

function ink(png: PNG, x: number, y: number) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = 0;
  png.data[idx + 1] = 0;
  png.data[idx + 2] = 0;
  png.data[idx + 3] = 255;
}

describe("Unterschriftenprüfung (serverseitig)", () => {
  it("akzeptiert ein PNG mit ausreichend Tinte", () => {
    const url = makePng(400, 150, (png) => {
      for (let x = 20; x < 380; x++) {
        for (let t = 0; t < 3; t++) ink(png, x, 60 + t);
      }
    });
    const result = validateSignatureDataUrl(url);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inkPixels).toBeGreaterThanOrEqual(150);
    expect(result.width).toBe(400);
  });

  it("lehnt ein leeres (weißes) PNG ab", () => {
    const url = makePng(400, 150, () => undefined);
    expect(() => validateSignatureDataUrl(url)).toThrow(SignatureError);
  });

  it("lehnt zu wenig Tinte ab", () => {
    const url = makePng(400, 150, (png) => {
      for (let x = 0; x < 20; x++) ink(png, x, 10);
    });
    expect(() => validateSignatureDataUrl(url)).toThrow(SignatureError);
  });

  it("lehnt falsche Formate ab", () => {
    expect(() => validateSignatureDataUrl("")).toThrow(SignatureError);
    expect(() => validateSignatureDataUrl("data:image/jpeg;base64,AAAA")).toThrow(SignatureError);
    expect(() => validateSignatureDataUrl("data:image/png;base64,%%%")).toThrow(SignatureError);
    // Gültiges Base64, aber kein PNG
    expect(() =>
      validateSignatureDataUrl(`data:image/png;base64,${Buffer.from("kein png").toString("base64")}`)
    ).toThrow(SignatureError);
  });

  it("lehnt zu kleine Abmessungen ab", () => {
    const url = makePng(50, 20, (png) => {
      for (let x = 0; x < 50; x++) for (let y = 0; y < 20; y++) ink(png, x, y);
    });
    expect(() => validateSignatureDataUrl(url)).toThrow(SignatureError);
  });
});
