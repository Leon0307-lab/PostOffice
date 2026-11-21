import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_KIND_LABELS } from "@/lib/archive-labels";
import { ConfidentialBadge, StatusBadge } from "@/components/StatusBadge";
import type { DocumentRow, Shipment } from "@/types";

export const metadata = { title: "Archiv" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  await requireUser();
  const supabase = await createClient();

  // Beides durch RLS auf sichtbare Sendungen begrenzt.
  const [shipmentsRes, docsRes] = await Promise.all([
    supabase
      .from("shipments")
      .select("id,shipment_number,subject,recipient_name,status,confidential,archived_at,delivered_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(100),
    supabase
      .from("documents")
      .select("id,shipment_id,kind,filename,created_at,mime_type,size_bytes,storage_bucket,storage_path")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const shipments = (shipmentsRes.data ?? []) as Pick<
    Shipment,
    "id" | "shipment_number" | "subject" | "recipient_name" | "status" | "confidential" | "archived_at"
  >[];
  const docs = (docsRes.data ?? []) as DocumentRow[];

  const docShipmentIds = [...new Set(docs.map((d) => d.shipment_id))];
  const { data: numData } = docShipmentIds.length
    ? await supabase.from("shipments").select("id,shipment_number").in("id", docShipmentIds)
    : { data: [] };
  const numbers = new Map((numData ?? []).map((n) => [n.id as string, n.shipment_number as string]));

  return (
    <div className="space-y-10">
      <PageHeader title="Digitales Archiv" subtitle="Archivierte Sendungen und gespeicherte Dokumente." />

      <section>
        <h2 className="mb-3 text-lg font-bold">Archivierte Sendungen</h2>
        {shipments.length === 0 ? (
          <EmptyState>Noch keine archivierten Sendungen.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Betreff</th>
                  <th>Empfänger</th>
                  <th>Status</th>
                  <th>Archiviert</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/shipments/${s.id}`} className="font-mono font-bold underline">
                        {s.shipment_number}
                      </Link>
                    </td>
                    <td>{s.confidential ? <ConfidentialBadge /> : s.subject}</td>
                    <td>{s.recipient_name}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>{formatDateTime(s.archived_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Dokumente</h2>
        {docs.length === 0 ? (
          <EmptyState>Keine Dokumente vorhanden.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Datei</th>
                  <th>Art</th>
                  <th>Sendung</th>
                  <th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={`/api/files/document/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                        {d.filename}
                      </a>
                    </td>
                    <td>{DOCUMENT_KIND_LABELS[d.kind]}</td>
                    <td>
                      <Link href={`/shipments/${d.shipment_id}`} className="font-mono underline">
                        {numbers.get(d.shipment_id) ?? "-"}
                      </Link>
                    </td>
                    <td>{formatDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
