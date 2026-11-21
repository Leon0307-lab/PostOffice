import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/permissions";
import { firstError, labelQuerySchema } from "@/lib/validation";
import { buildLabelsPdf, type LabelData } from "@/lib/pdf/labels";
import { PRIORITY_LABELS } from "@/lib/constants";
import { locationLabel } from "@/lib/data";
import { writeAudit } from "@/lib/audit";
import { logServerError } from "@/lib/errors";
import { fileResponse } from "@/lib/storage";
import type { Location, ShipmentPriority } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Etiketten-PDF (DIN A4). Nur Poststelle/Administrator; Sichtbarkeit zusätzlich per RLS. */
export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!isStaff(current.profile.role)) {
    return NextResponse.json({ error: "Dazu fehlt die Berechtigung." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const parsed = labelQuerySchema.safeParse({
    ids: params.getAll("ids"),
    mode: params.get("mode") ?? undefined,
    position: params.get("position") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { ids, mode, position } = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipments")
      .select(
        "id,shipment_number,sender_name,recipient_name,recipient_department_id,location_id,priority,confidential"
      )
      .in("id", ids);
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Keine Sendungen gefunden." }, { status: 404 });
    }

    const [{ data: depts }, { data: locs }] = await Promise.all([
      supabase.from("departments").select("id,name"),
      supabase.from("locations").select("id,building,floor,room,department_id"),
    ]);
    const deptName = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]));
    const locMap = new Map((locs ?? []).map((l) => [l.id as string, l as Location]));

    // Reihenfolge der Auswahl beibehalten.
    const byId = new Map(data.map((s) => [s.id as string, s]));
    const ordered = ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));

    const labels: LabelData[] = ordered.map((s) => ({
      shipmentNumber: s.shipment_number as string,
      senderName: s.sender_name as string,
      recipientName: s.recipient_name as string,
      departmentName: s.recipient_department_id ? (deptName.get(s.recipient_department_id as string) ?? "") : "",
      locationText: locationLabel(s.location_id ? locMap.get(s.location_id as string) : null),
      priorityLabel: PRIORITY_LABELS[s.priority as ShipmentPriority],
      priority: s.priority as ShipmentPriority,
      confidential: Boolean(s.confidential),
    }));

    const pdf = await buildLabelsPdf(labels, mode, position);
    await writeAudit(current.user.id, "label.print", "shipment", null, {
      count: labels.length,
      mode,
    });
    return fileResponse(Buffer.from(pdf), "application/pdf", "PostOffice-Etiketten.pdf");
  } catch (e) {
    logServerError("labels", e);
    return NextResponse.json({ error: "Etiketten konnten nicht erstellt werden." }, { status: 500 });
  }
}
