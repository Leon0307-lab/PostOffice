import "server-only";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFile, uploadFile } from "@/lib/storage";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { METHOD_LABELS, TYPE_LABELS } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import type { ShipmentMethodKey } from "@/lib/receipt-types";

interface ReceiptDocument {
  id: string;
  storage_bucket: string;
  storage_path: string;
  filename: string;
}

/**
 * Stellt sicher, dass für eine zugestellte Sendung eine archivierte PDF-Empfangsbestätigung existiert.
 * Wird nach der Zustellung automatisch aufgerufen und beim Öffnen der PDF als Nachholmechanismus.
 * Arbeitet mit Service-Role; der AUFRUFER muss die Berechtigung vorher geprüft haben.
 */
export async function ensureReceipt(
  shipmentId: string,
  actorId: string | null
): Promise<ReceiptDocument> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("documents")
    .select("id,storage_bucket,storage_path,filename")
    .eq("shipment_id", shipmentId)
    .eq("kind", "empfangsbestaetigung")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as ReceiptDocument;

  const { data: shipment, error: sErr } = await admin
    .from("shipments")
    .select(
      "id,shipment_number,sender_name,recipient_name,recipient_department_id,shipment_type,shipping_method,status,delivered_at,assigned_courier_id"
    )
    .eq("id", shipmentId)
    .single();
  if (sErr || !shipment) throw new Error("Sendung für Empfangsbestätigung nicht gefunden.");
  if (shipment.status !== "zugestellt" || !shipment.delivered_at) {
    throw new Error("Empfangsbestätigungen gibt es nur für zugestellte Sendungen.");
  }

  const { data: signature, error: gErr } = await admin
    .from("signatures")
    .select("recipient_name,storage_path,sha256,captured_by")
    .eq("shipment_id", shipmentId)
    .single();
  if (gErr || !signature) throw new Error("Keine Unterschrift für die Sendung gefunden.");

  const [{ data: department }, { data: courier }, { data: org }] = await Promise.all([
    shipment.recipient_department_id
      ? admin.from("departments").select("name").eq("id", shipment.recipient_department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("profiles").select("full_name").eq("id", signature.captured_by).maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "organization_name").maybeSingle(),
  ]);

  const signaturePng = await downloadFile("signatures", signature.storage_path);
  const pdfBytes = await buildReceiptPdf({
    organizationName: typeof org?.value === "string" ? org.value : "PostOffice",
    shipmentNumber: shipment.shipment_number,
    senderName: shipment.sender_name,
    recipientName: shipment.recipient_name,
    departmentName: department?.name ?? "",
    typeLabel: TYPE_LABELS[shipment.shipment_type as keyof typeof TYPE_LABELS] ?? shipment.shipment_type,
    methodLabel:
      METHOD_LABELS[shipment.shipping_method as ShipmentMethodKey] ?? shipment.shipping_method,
    deliveredAt: new Date(shipment.delivered_at),
    courierName: courier?.full_name ?? "",
    signedRecipientName: signature.recipient_name,
    signaturePng,
    signatureSha256: signature.sha256,
  });

  const buffer = Buffer.from(pdfBytes);
  const path = `${shipmentId}/empfangsbestaetigung-${shipment.shipment_number}.pdf`;
  try {
    await uploadFile("receipts", path, buffer, "application/pdf");
  } catch (e) {
    // Parallelaufruf hat evtl. schon hochgeladen -> vorhandenen Eintrag erneut suchen.
    const { data: again } = await admin
      .from("documents")
      .select("id,storage_bucket,storage_path,filename")
      .eq("shipment_id", shipmentId)
      .eq("kind", "empfangsbestaetigung")
      .limit(1)
      .maybeSingle();
    if (again) return again as ReceiptDocument;
    throw e;
  }

  const filename = `Empfangsbestaetigung_${shipment.shipment_number}.pdf`;
  const { data: doc, error: dErr } = await admin
    .from("documents")
    .insert({
      shipment_id: shipmentId,
      kind: "empfangsbestaetigung",
      storage_bucket: "receipts",
      storage_path: path,
      filename,
      mime_type: "application/pdf",
      size_bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      created_by: actorId,
    })
    .select("id,storage_bucket,storage_path,filename")
    .single();
  if (dErr || !doc) throw new Error(`Dokument konnte nicht registriert werden: ${dErr?.message}`);

  await admin.from("shipment_events").insert({
    shipment_id: shipmentId,
    event_type: "empfangsbestaetigung",
    comment: "Empfangsbestätigung gespeichert",
    actor_id: actorId,
    metadata: { document_id: doc.id },
  });
  await writeAudit(actorId, "receipt.create", "shipment", shipmentId, { document_id: doc.id });

  return doc as ReceiptDocument;
}
