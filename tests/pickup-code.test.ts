import { describe, expect, it } from "vitest";
import {
  generatePickupCode,
  hashPickupCode,
  isPlausiblePickupCode,
  normalizePickupCode,
} from "@/lib/pickup-code";

const PEPPER = "test-pepper-mit-mindestens-16-zeichen";

describe("Abholcodes", () => {
  it("erzeugt Codes im Format XXXX-XXXX ohne verwechselbare Zeichen", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePickupCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(isPlausiblePickupCode(code)).toBe(true);
    }
  });

  it("erzeugt keine Duplikate in einer größeren Stichprobe", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generatePickupCode()));
    expect(set.size).toBe(2000);
  });

  it("Hash ist 64 Zeichen Hex und enthält nie den Klartext", () => {
    const code = generatePickupCode();
    const hash = hashPickupCode(code, PEPPER);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.toUpperCase()).not.toContain(normalizePickupCode(code));
  });

  it("Eingabevarianten (Klein-/Großschreibung, Bindestrich, Leerzeichen) ergeben denselben Hash", () => {
    const h1 = hashPickupCode("K7QM-4TZ9", PEPPER);
    expect(hashPickupCode("k7qm4tz9", PEPPER)).toBe(h1);
    expect(hashPickupCode(" K7QM 4TZ9 ", PEPPER)).toBe(h1);
  });

  it("anderer Pepper oder anderer Code ergibt anderen Hash", () => {
    expect(hashPickupCode("K7QM-4TZ9", PEPPER)).not.toBe(hashPickupCode("K7QM-4TZ9", `${PEPPER}x`));
    expect(hashPickupCode("K7QM-4TZ9", PEPPER)).not.toBe(hashPickupCode("K7QM-4TZ8", PEPPER));
  });

  it("verweigert fehlenden oder zu kurzen Pepper", () => {
    expect(() => hashPickupCode("K7QM-4TZ9", "")).toThrow();
    expect(() => hashPickupCode("K7QM-4TZ9", "kurz")).toThrow();
  });

  it("lehnt unplausible Eingaben ab", () => {
    expect(isPlausiblePickupCode("")).toBe(false);
    expect(isPlausiblePickupCode("ABC")).toBe(false);
    expect(isPlausiblePickupCode("0000-0000")).toBe(false); // 0 und O sind nicht im Zeichenvorrat
  });
});
