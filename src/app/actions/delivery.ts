"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import { deliverSchema, firstError, formToObject, photoMetaSchema } from "@/lib/validation";
import { SignatureError, validateSignatureDataUrl } from "@/lib/signature";
import {
  generatePickupCode,
  getPepper,
  hashPickupCode,
  isPlausiblePickupCode,
} from "@/lib/pickup-code";
import { removeFile, uploadFile } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { MAX_PHOTO_BYTES } from "@/lib/constants";
import { ensureReceipt } from "@/lib/receipt-service";
import { getSetting } from "@/lib/data";
import type { ActionState } from "@/types";

const NOT_LOGGED_IN: ActionState = { ok: false, message: "Bitte erneut anmelden." };

/**
 * Zustellung bestätigen.
 * Ablauf (alle Prüfungen serverseitig):
 *  1. Eingaben validieren, Unterschrift als echtes PNG mit Tinte prüfen
 *  2. Zugriff über Row Level Security + po_can_process_shipment prüfen
 *  3. Unterschrift in privaten Bucket speichern
 *  4. po_deliver_shipment: atomar Unterschrift + Status (+ Abholcode-Einlösung)
 *  5. Bei Datenbankfehler: hochgeladene Datei wieder entfernen
 *  6. Empfangsbestätigung (PDF) erzeugen und archivieren
 */
export async function deliverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = deliverSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  let signature: ReturnType<typeof validateSignatureDataUrl>;
  try {
    signature = validateSignatureDataUrl(v.signature);
  } catch (e) {
    if (e instanceof SignatureError) return { ok: false, message: e.message };
    logServerError("signature validation", e);
    return { ok: false, message: "Unterschrift konnte nicht geprüft werden." };
  }

  let codeHash: string | null = null;
  if (v.pickupCode) {
    if (!isPlausiblePickupCode(v.pickupCode)) {
      return { ok: false, message: "Der Abholcode hat ein ungültiges Format." };
    }
    codeHash = hashPickupCode(v.pickupCode, getPepper());
  }

  const supabase = await createClient();
  const { data: canProcess, error: permError } = await supabase.rpc("po_can_process_shipment", {
    p_shipment: v.shipmentId,
  });
  if (permError || canProcess !== true) {
    return { ok: false, message: "Dazu fehlt die Berechtigung oder die Sendung existiert nicht." };
  }

  const path = `${v.shipmentId}/${randomUUID()}.png`;
  try {
    await uploadFile("signatures", path, signature.buffer, "image/png");
  } catch (e) {
    logServerError("signature upload", e);
    return { ok: false, message: "Die Unterschrift konnte nicht gespeichert werden." };
  }

  const { error } = await supabase.rpc("po_deliver_shipment", {
    p_shipment: v.shipmentId,
    p_recipient_name: v.recipientName,
    p_signature_path: path,
    p_signature_sha256: signature.sha256,
    p_pickup_code_hash: codeHash,
  });
  if (error) {
    await removeFile("signatures", path).catch(() => undefined);
    logServerError("po_deliver_shipment", error);
    return { ok: false, message: dbErrorMessage(error) };
  }

  // Empfangsbestätigung: Fehler gefährden die (bereits abgeschlossene) Zustellung nicht,
  // sie wird bei Bedarf beim Öffnen der PDF automatisch nachgeholt.
  try {
    await ensureReceipt(v.shipmentId, current.user.id);
  } catch (e) {
    logServerError("receipt generation", e);
    await writeAudit(current.user.id, "receipt.failed", "shipment", v.shipmentId);
  }

  revalidatePath(`/shipments/${v.shipmentId}`);
  revalidatePath("/courier");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  redirect(`/shipments/${v.shipmentId}?delivered=1`);
}

/** Abholcode erzeugen. Klartext wird genau einmal zurückgegeben und nie gespeichert. */
export async function createPickupCodeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;
  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) return { ok: false, message: "Ungültige Sendung." };

  const ttlHours = Math.min(
    Math.max(Number(await getSetting<number>("pickup_code_ttl_hours", 72)) || 72, 1),
    336
  );
  const code = generatePickupCode();
  const hash = hashPickupCode(code, getPepper());
  const expires = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_create_pickup_code", {
    p_shipment: shipmentId,
    p_code_hash: hash,
    p_expires_at: expires,
  });
  if (error) {
    logServerError("po_create_pickup_code", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${shipmentId}`);
  return {
    ok: true,
    message: `Abholcode erzeugt (gültig ${ttlHours} Stunden, einmalig verwendbar). Er wird nur jetzt angezeigt.`,
    secret: code,
  };
}

const PHOTO_MIME: Record<string, { ext: string; magic: number[][] }> = {
  "image/jpeg": { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/webp": { ext: "webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
};

function matchesMagic(buf: Buffer, magic: number[][]): boolean {
  return magic.some((m) => m.every((byte, i) => buf[i] === byte));
}

/** Foto zu einer Sendung speichern (privater Bucket, Typ- und Größenprüfung). */
export async function uploadPhotoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = photoMetaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Bitte ein Foto aufnehmen oder auswählen." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: "Das Foto ist zu groß (maximal 8 MB)." };
  }
  const rule = PHOTO_MIME[file.type];
  if (!rule) return { ok: false, message: "Nur JPEG-, PNG- oder WebP-Bilder sind erlaubt." };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesMagic(buffer, rule.magic)) {
    return { ok: false, message: "Die Datei ist kein gültiges Bild." };
  }

  const supabase = await createClient();
  const { data: canProcess } = await supabase.rpc("po_can_process_shipment", {
    p_shipment: v.shipmentId,
  });
  if (canProcess !== true) {
    return { ok: false, message: "Dazu fehlt die Berechtigung oder die Sendung existiert nicht." };
  }

  const path = `${v.shipmentId}/${randomUUID()}.${rule.ext}`;
  try {
    await uploadFile("photos", path, buffer, file.type);
  } catch (e) {
    logServerError("photo upload", e);
    return { ok: false, message: "Das Foto konnte nicht gespeichert werden." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("shipment_photos").insert({
    shipment_id: v.shipmentId,
    storage_path: path,
    category: v.category,
    note: v.note || null,
    mime_type: file.type,
    size_bytes: file.size,
    taken_by: current.user.id,
  });
  if (error) {
    await removeFile("photos", path).catch(() => undefined);
    logServerError("photo insert", error);
    return { ok: false, message: "Das Foto konnte nicht zugeordnet werden." };
  }
  await admin.from("shipment_events").insert({
    shipment_id: v.shipmentId,
    event_type: "foto",
    comment: `Foto hinzugefügt (${v.category})`,
    actor_id: current.user.id,
    metadata: { category: v.category },
  });
  await writeAudit(current.user.id, "photo.upload", "shipment", v.shipmentId, {
    category: v.category,
  });

  revalidatePath(`/shipments/${v.shipmentId}`);
  return { ok: true, message: "Foto gespeichert." };
}
