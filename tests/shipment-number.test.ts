import { describe, expect, it } from "vitest";
import {
  isValidShipmentNumber,
  parseScanInput,
  qrPayload,
} from "@/lib/shipment-number";

describe("Sendungsnummer-Format", () => {
  it("akzeptiert PO-JJJJ-NNNNNN", () => {
    expect(isValidShipmentNumber("PO-2026-000001")).toBe(true);
    expect(isValidShipmentNumber("PO-2026-999999")).toBe(true);
  });

  it("lehnt ungültige Formate ab", () => {
    for (const bad of ["", "PO-2026-1", "po-2026-000001", "PO-26-000001", "PO-2026-0000011", "X-2026-000001", "PO-2026-00000A"]) {
      expect(isValidShipmentNumber(bad)).toBe(false);
    }
  });
});

describe("Barcode-/QR-Verarbeitung (parseScanInput)", () => {
  it("erkennt reine Nummern, auch in Kleinschreibung und mit Leerzeichen", () => {
    expect(parseScanInput("PO-2026-000123")).toBe("PO-2026-000123");
    expect(parseScanInput("  po-2026-000123 \n")).toBe("PO-2026-000123");
  });

  it("extrahiert die Nummer aus URLs oder Texten", () => {
    expect(parseScanInput("https://post.example/s/PO-2026-000042?x=1")).toBe("PO-2026-000042");
  });

  it("gibt null bei unbekannten oder ungültigen Eingaben zurück", () => {
    expect(parseScanInput("")).toBeNull();
    expect(parseScanInput("12345")).toBeNull();
    expect(parseScanInput("PO-2026")).toBeNull();
    expect(parseScanInput("x".repeat(600))).toBeNull();
  });

  it("QR-Inhalt entspricht der Sendungsnummer", () => {
    expect(qrPayload("PO-2026-000001")).toBe("PO-2026-000001");
  });
});
