import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Bucket = "signatures" | "receipts" | "labels" | "photos" | "documents";

/**
 * Datei in einen PRIVATEN Bucket hochladen (Service-Role, nur nach Berechtigungsprüfung).
 * Es wird nie überschrieben (upsert=false).
 */
export async function uploadFile(
  bucket: Bucket,
  path: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: "private, max-age=0",
  });
  if (error) throw new Error(`Upload fehlgeschlagen (${bucket}): ${error.message}`);
}

export async function downloadFile(bucket: Bucket, path: string): Promise<Buffer> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Download fehlgeschlagen (${bucket}): ${error?.message ?? "leer"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeFile(bucket: Bucket, path: string): Promise<void> {
  const admin = createAdminClient();
  await admin.storage.from(bucket).remove([path]);
}

/** Dateiname für Content-Disposition bereinigen. */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "datei";
}

/** Antwort mit Datei; niemals öffentlich cachebar. */
export function fileResponse(
  buffer: Buffer,
  mime: string,
  filename: string,
  inline = true
): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFilename(filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
