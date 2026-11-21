import { describe, expect, it } from "vitest";
import {
  createShipmentSchema,
  deliverSchema,
  loginSchema,
  noteSchema,
  settingsSchema,
  statusChangeSchema,
  userCreateSchema,
} from "@/lib/validation";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("Formularvalidierung", () => {
  it("Anmeldung: E-Mail und Passwort sind Pflicht", () => {
    expect(loginSchema.safeParse({ email: "a@b.de", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "kein-mail", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.de", password: "" }).success).toBe(false);
  });

  const base = {
    type: "brief",
    method: "hauspost",
    direction: "intern",
    priority: "normal",
    subject: "Vertrag",
    recipientName: "Max Muster",
  };

  it("Sendungserstellung: gültige Eingabe", () => {
    const r = createShipmentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.confidential).toBe(false);
      expect(r.data.recipientId).toBeNull();
    }
  });

  it("Sendungserstellung: Empfänger ODER Empfängername erforderlich", () => {
    expect(createShipmentSchema.safeParse({ ...base, recipientName: "" }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, recipientName: "", recipientId: UUID }).success).toBe(true);
  });

  it("Sendungserstellung: lehnt ungültige Enums, leeren Betreff und überlangen Text ab", () => {
    expect(createShipmentSchema.safeParse({ ...base, type: "rakete" }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, priority: "sofort" }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, subject: "   " }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, subject: "x".repeat(201) }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, description: "x".repeat(4001) }).success).toBe(false);
  });

  it("Vertraulich-Checkbox wird korrekt gelesen", () => {
    const r = createShipmentSchema.safeParse({ ...base, confidential: "on" });
    expect(r.success && r.data.confidential).toBe(true);
  });

  it("Statuswechsel: 'zugestellt' ist NICHT über den allgemeinen Statuswechsel erlaubt", () => {
    expect(statusChangeSchema.safeParse({ shipmentId: UUID, to: "zugestellt" }).success).toBe(false);
    expect(statusChangeSchema.safeParse({ shipmentId: UUID, to: "zugewiesen" }).success).toBe(false);
    expect(statusChangeSchema.safeParse({ shipmentId: UUID, to: "uebernommen" }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ shipmentId: "nicht-uuid", to: "uebernommen" }).success).toBe(false);
  });

  it("Zustellung: Name und Unterschrift sind Pflicht", () => {
    const sig = `data:image/png;base64,${"A".repeat(100)}`;
    expect(deliverSchema.safeParse({ shipmentId: UUID, recipientName: "Eva Beispiel", signature: sig }).success).toBe(true);
    expect(deliverSchema.safeParse({ shipmentId: UUID, recipientName: "E", signature: sig }).success).toBe(false);
    expect(deliverSchema.safeParse({ shipmentId: UUID, recipientName: "Eva Beispiel", signature: "" }).success).toBe(false);
    expect(deliverSchema.safeParse({ shipmentId: UUID, recipientName: "Eva Beispiel" }).success).toBe(false);
  });

  it("Notiz: nicht leer", () => {
    expect(noteSchema.safeParse({ shipmentId: UUID, comment: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ shipmentId: UUID, comment: "Tür verschlossen" }).success).toBe(true);
  });

  it("Benutzer: Passwort mindestens 12 Zeichen, Rolle gültig", () => {
    const user = { email: "a@b.de", fullName: "Anna Test", role: "zusteller", password: "langes-passwort-123" };
    expect(userCreateSchema.safeParse(user).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...user, password: "kurz" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...user, role: "root" }).success).toBe(false);
  });

  it("Einstellungen: Gültigkeit 1-336 Stunden", () => {
    expect(settingsSchema.safeParse({ organizationName: "Org", pickupCodeTtlHours: "72" }).success).toBe(true);
    expect(settingsSchema.safeParse({ organizationName: "Org", pickupCodeTtlHours: "0" }).success).toBe(false);
    expect(settingsSchema.safeParse({ organizationName: "Org", pickupCodeTtlHours: "400" }).success).toBe(false);
  });
});
