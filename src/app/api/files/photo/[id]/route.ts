import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { downloadFile, fileResponse } from "@/lib/storage";
import { logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Foto ausliefern; Berechtigung über RLS auf shipment_photos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("shipment_photos")
    .select("id,storage_path,mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  try {
    const buffer = await downloadFile("photos", photo.storage_path as string);
    return fileResponse(buffer, photo.mime_type as string, `foto-${id}`);
  } catch (e) {
    logServerError("photo download", e);
    return NextResponse.json({ error: "Datei nicht verfügbar." }, { status: 500 });
  }
}
