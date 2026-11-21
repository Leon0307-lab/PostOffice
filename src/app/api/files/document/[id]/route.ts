import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { downloadFile, fileResponse, type Bucket } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKETS: Bucket[] = ["signatures", "receipts", "labels", "photos", "documents"];

/**
 * Archivdokument ausliefern. Die Berechtigung wird über Row Level Security geprüft
 * (documents-Select mit po_can_view_shipment). Erst danach wird mit Service-Role gelesen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id,shipment_id,storage_bucket,storage_path,filename,mime_type")
    .eq("id", id)
    .maybeSingle();
  // Kein Eintrag = nicht vorhanden ODER nicht berechtigt (bewusst nicht unterscheidbar).
  if (!doc || !BUCKETS.includes(doc.storage_bucket as Bucket)) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  try {
    const buffer = await downloadFile(doc.storage_bucket as Bucket, doc.storage_path as string);
    await writeAudit(current.user.id, "document.view", "document", id, {
      shipment_id: doc.shipment_id,
    });
    return fileResponse(buffer, doc.mime_type as string, doc.filename as string);
  } catch (e) {
    logServerError("document download", e);
    return NextResponse.json({ error: "Datei nicht verfügbar." }, { status: 500 });
  }
}
