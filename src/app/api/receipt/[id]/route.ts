import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureReceipt } from "@/lib/receipt-service";
import { downloadFile, fileResponse, type Bucket } from "@/lib/storage";
import { logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Empfangsbestätigung einer zugestellten Sendung (ID = Sendungs-ID).
 * Fehlt die archivierte PDF (z. B. Fehler direkt nach der Zustellung), wird sie nachgeholt.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (!shipment) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (shipment.status !== "zugestellt") {
    return NextResponse.json({ error: "Sendung wurde noch nicht zugestellt." }, { status: 409 });
  }

  try {
    const doc = await ensureReceipt(id, current.user.id);
    const buffer = await downloadFile(doc.storage_bucket as Bucket, doc.storage_path);
    return fileResponse(buffer, "application/pdf", doc.filename);
  } catch (e) {
    logServerError("receipt", e);
    return NextResponse.json({ error: "Empfangsbestätigung nicht verfügbar." }, { status: 500 });
  }
}
