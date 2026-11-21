"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import {
  assignSchema,
  createShipmentSchema,
  firstError,
  formToObject,
  grantSchema,
  noteSchema,
  statusChangeSchema,
  updateShipmentSchema,
} from "@/lib/validation";
import { isStaff } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/types";

const NOT_LOGGED_IN: ActionState = { ok: false, message: "Bitte erneut anmelden." };

export async function createShipmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = createShipmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  // Nicht-Poststelle: Direction eingehend wird zusätzlich von der Datenbank abgelehnt.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("po_create_shipment", {
    p_sender_name: v.senderName,
    p_sender_profile_id: v.senderProfileId,
    p_recipient_id: v.recipientId,
    p_recipient_name: v.recipientName,
    p_recipient_department_id: v.recipientDepartmentId,
    p_location_id: v.locationId,
    p_type: v.type,
    p_method: v.method,
    p_direction: v.direction,
    p_priority: v.priority,
    p_subject: v.subject,
    p_description: v.description,
    p_confidential: v.confidential,
  });
  if (error || !data) {
    logServerError("po_create_shipment", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  const result = data as { id: string; shipment_number: string };
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  redirect(`/shipments/${result.id}?created=1`);
}

export async function updateShipmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;
  if (!isStaff(current.profile.role)) return { ok: false, message: "Dazu fehlt die Berechtigung." };

  const parsed = updateShipmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipments")
    .update({
      subject: v.subject,
      description: v.description,
      priority: v.priority,
      confidential: v.confidential,
    })
    .eq("id", v.shipmentId)
    .select("id");
  if (error) {
    logServerError("update shipment", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "Sendung nicht gefunden oder nicht mehr bearbeitbar." };
  }
  await writeAudit(current.user.id, "shipment.update", "shipment", v.shipmentId, {
    fields: ["subject", "description", "priority", "confidential"],
  });
  revalidatePath(`/shipments/${v.shipmentId}`);
  return { ok: true, message: "Änderungen gespeichert." };
}

export async function changeStatusAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = statusChangeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_change_status", {
    p_shipment: v.shipmentId,
    p_to: v.to,
    p_comment: v.comment || null,
    p_reason: v.reason ?? null,
  });
  if (error) {
    logServerError("po_change_status", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${v.shipmentId}`);
  revalidatePath("/shipments");
  revalidatePath("/courier");
  revalidatePath("/dashboard");
  revalidatePath("/returns");
  return { ok: true, message: "Status aktualisiert." };
}

export async function assignCourierAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;
  if (!isStaff(current.profile.role)) return { ok: false, message: "Dazu fehlt die Berechtigung." };

  const parsed = assignSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_assign_shipment", {
    p_shipment: v.shipmentId,
    p_courier: v.courierId,
    p_comment: v.comment || null,
  });
  if (error) {
    logServerError("po_assign_shipment", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${v.shipmentId}`);
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  return { ok: true, message: "Zusteller zugewiesen." };
}

export async function addNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = noteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_add_note", {
    p_shipment: parsed.data.shipmentId,
    p_comment: parsed.data.comment,
  });
  if (error) {
    logServerError("po_add_note", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${parsed.data.shipmentId}`);
  return { ok: true, message: "Notiz gespeichert." };
}

export async function archiveShipmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;
  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) return { ok: false, message: "Ungültige Sendung." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_archive_shipment", { p_shipment: shipmentId });
  if (error) {
    logServerError("po_archive_shipment", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/archive");
  return { ok: true, message: "Sendung archiviert." };
}

export async function grantAccessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;

  const parsed = grantSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  let expires: string | null = null;
  if (parsed.data.expiresAt) {
    const d = new Date(parsed.data.expiresAt);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return { ok: false, message: "Das Ablaufdatum muss in der Zukunft liegen." };
    }
    expires = d.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_grant_access", {
    p_shipment: parsed.data.shipmentId,
    p_profile: parsed.data.profileId,
    p_expires_at: expires,
  });
  if (error) {
    logServerError("po_grant_access", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/shipments/${parsed.data.shipmentId}`);
  return { ok: true, message: "Zugriff freigegeben." };
}

export async function revokeAccessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return NOT_LOGGED_IN;
  const grantId = String(formData.get("grantId") ?? "");
  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(grantId)) return { ok: false, message: "Ungültige Freigabe." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("po_revoke_access", { p_grant: grantId });
  if (error) {
    logServerError("po_revoke_access", error);
    return { ok: false, message: dbErrorMessage(error) };
  }
  if (/^[0-9a-f-]{36}$/i.test(shipmentId)) revalidatePath(`/shipments/${shipmentId}`);
  return { ok: true, message: "Freigabe entzogen." };
}
