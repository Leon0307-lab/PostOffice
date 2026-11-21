"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseScanInput } from "@/lib/shipment-number";
import { writeAudit } from "@/lib/audit";
import { canScan } from "@/lib/permissions";
import { STATUS_LABELS } from "@/lib/constants";
import type { ShipmentStatus } from "@/types";

export interface ScanResult {
  found: boolean;
  /** Eingabe war keine gültige Sendungsnummer */
  invalid?: boolean;
  id?: string;
  shipmentNumber?: string;
  subject?: string;
  recipientName?: string;
  status?: ShipmentStatus;
  statusLabel?: string;
  confidential?: boolean;
  message: string;
}

/**
 * Sendung per Scan/Tastatureingabe nachschlagen.
 * - Ungültige Eingaben und für den Benutzer unsichtbare Sendungen führen zur gleichen
 *   Antwort "unbekannt" (kein Hinweis auf die Existenz fremder Sendungen).
 * - Die Sichtbarkeit wird durch Row Level Security erzwungen.
 */
export async function lookupShipmentAction(raw: string): Promise<ScanResult> {
  const current = await getCurrentUser();
  if (!current) return { found: false, message: "Bitte erneut anmelden." };
  if (!canScan(current.profile.role)) {
    return { found: false, message: "Dazu fehlt die Berechtigung." };
  }

  const number = parseScanInput(raw);
  if (!number) {
    return {
      found: false,
      invalid: true,
      message: "Kein gültiger Sendungscode. Erwartet wird z. B. PO-2026-000001.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select("id,shipment_number,subject,recipient_name,status,confidential")
    .eq("shipment_number", number)
    .maybeSingle();

  if (!data) {
    await writeAudit(current.user.id, "scan.unknown", "shipment", null, { number });
    return {
      found: false,
      message: `Unbekannte Sendung: ${number}. Sie existiert nicht oder ist für Sie nicht sichtbar.`,
    };
  }

  const status = data.status as ShipmentStatus;
  return {
    found: true,
    id: data.id as string,
    shipmentNumber: data.shipment_number as string,
    subject: data.confidential ? "Vertraulich" : (data.subject as string),
    recipientName: data.recipient_name as string,
    status,
    statusLabel: STATUS_LABELS[status],
    confidential: Boolean(data.confidential),
    message: "Sendung gefunden.",
  };
}
