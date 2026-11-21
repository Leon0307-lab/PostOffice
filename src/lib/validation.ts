import { z } from "zod";
import {
  DIRECTIONS,
  PHOTO_CATEGORIES,
  PRIORITIES,
  RETURN_REASONS,
  ROLES,
  SHIPMENT_TYPES,
  SHIPPING_METHODS,
} from "@/lib/constants";

const uuid = z.string().uuid("Ungültige ID.");
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .pipe(z.string().uuid("Ungültige ID.").nullable());

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} fehlt.` })
    .trim()
    .min(min, `${label} ist zu kurz.`)
    .max(max, `${label} ist zu lang.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang.`)
    .optional()
    .transform((v) => v ?? "");

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const loginSchema = z.object({
  email: z.string().trim().email("Bitte eine gültige E-Mail-Adresse eingeben.").max(254),
  password: z.string().min(1, "Passwort fehlt.").max(200),
});

export const createShipmentSchema = z
  .object({
    senderName: optionalText(160, "Absender"),
    senderProfileId: optionalUuid,
    recipientId: optionalUuid,
    recipientName: optionalText(160, "Empfänger"),
    recipientDepartmentId: optionalUuid,
    locationId: optionalUuid,
    type: z.enum(SHIPMENT_TYPES as [string, ...string[]]),
    method: z.enum(SHIPPING_METHODS as [string, ...string[]]),
    direction: z.enum(DIRECTIONS as [string, ...string[]]),
    priority: z.enum(PRIORITIES as [string, ...string[]]),
    subject: trimmed(1, 200, "Betreff"),
    description: optionalText(4000, "Beschreibung"),
    confidential: checkbox,
  })
  .refine((v) => v.recipientId !== null || v.recipientName.length > 0, {
    message: "Bitte einen Empfänger auswählen oder einen Empfängernamen eingeben.",
    path: ["recipientName"],
  });

export const updateShipmentSchema = z.object({
  shipmentId: uuid,
  subject: trimmed(1, 200, "Betreff"),
  description: optionalText(4000, "Beschreibung"),
  priority: z.enum(PRIORITIES as [string, ...string[]]),
  confidential: checkbox,
});

export const statusChangeSchema = z.object({
  shipmentId: uuid,
  to: z.enum([
    "eingegangen",
    "uebernommen",
    "im_transport",
    "in_zustellung",
    "abholbereit",
    "nicht_zustellbar",
    "rueckgabe_eingeleitet",
    "zurueckgesendet",
  ]),
  comment: optionalText(2000, "Kommentar"),
  reason: z
    .enum(RETURN_REASONS as [string, ...string[]])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const assignSchema = z.object({
  shipmentId: uuid,
  courierId: uuid,
  comment: optionalText(1000, "Kommentar"),
});

export const noteSchema = z.object({
  shipmentId: uuid,
  comment: trimmed(1, 2000, "Notiz"),
});

export const deliverSchema = z.object({
  shipmentId: uuid,
  recipientName: trimmed(2, 160, "Empfängername"),
  signature: z.string().min(50, "Unterschrift fehlt.").max(800_000, "Unterschrift ist zu groß."),
  pickupCode: z.string().trim().max(32).optional().transform((v) => v ?? ""),
});

export const photoMetaSchema = z.object({
  shipmentId: uuid,
  category: z.enum(PHOTO_CATEGORIES as [string, ...string[]]),
  note: optionalText(1000, "Notiz"),
});

export const grantSchema = z.object({
  shipmentId: uuid,
  profileId: uuid,
  expiresAt: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v : null)),
});

export const departmentSchema = z.object({
  id: optionalUuid,
  name: trimmed(1, 120, "Name"),
  code: trimmed(1, 20, "Kürzel").transform((v) => v.toUpperCase()),
  headProfileId: optionalUuid,
});

export const locationSchema = z.object({
  id: optionalUuid,
  building: trimmed(1, 80, "Gebäude"),
  floor: optionalText(40, "Etage"),
  room: optionalText(40, "Raum"),
  departmentId: optionalUuid,
});

export const userCreateSchema = z.object({
  email: z.string().trim().email("Ungültige E-Mail-Adresse.").max(254),
  fullName: trimmed(2, 120, "Name"),
  role: z.enum(ROLES as [string, ...string[]]),
  departmentId: optionalUuid,
  password: z
    .string()
    .min(12, "Das Passwort muss mindestens 12 Zeichen lang sein.")
    .max(200),
});

export const userUpdateSchema = z.object({
  profileId: uuid,
  role: z.enum(ROLES as [string, ...string[]]),
  departmentId: optionalUuid,
  isActive: checkbox,
  fullName: trimmed(2, 120, "Name"),
});

export const routeSchema = z.object({
  name: trimmed(1, 120, "Name"),
  courierId: uuid,
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
});

export const routeStopSchema = z.object({
  routeId: uuid,
  shipmentId: uuid,
});

export const settingsSchema = z.object({
  organizationName: trimmed(1, 120, "Organisationsname"),
  pickupCodeTtlHours: z.coerce
    .number({ invalid_type_error: "Gültigkeit muss eine Zahl sein." })
    .int()
    .min(1, "Mindestens 1 Stunde.")
    .max(336, "Höchstens 336 Stunden (14 Tage)."),
});

export const labelQuerySchema = z.object({
  ids: z.array(uuid).min(1, "Keine Sendung ausgewählt.").max(200),
  mode: z.enum(["sheet", "single"]).default("sheet"),
  position: z.coerce.number().int().min(1).max(8).default(1),
});

/** Formularwerte (FormData) in ein einfaches Objekt umwandeln. */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

/** Erste Fehlermeldung eines Zod-Fehlers. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ungültige Eingabe.";
}
