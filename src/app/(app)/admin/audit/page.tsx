import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDirectory, nameMap } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit-Protokoll" };
export const dynamic = "force-dynamic";

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export default async function AuditPage() {
  await requireRole(["administrator"]);
  const supabase = await createClient();
  const [{ data, error }, directory] = await Promise.all([
    // RLS: nur Administratoren dürfen audit_logs lesen.
    supabase
      .from("audit_logs")
      .select("id,actor_id,action,entity,entity_id,details,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    getDirectory(),
  ]);
  const rows = (data ?? []) as AuditRow[];
  const names = nameMap(directory);

  return (
    <div>
      <PageHeader title="Audit-Protokoll" subtitle="Die letzten 200 Einträge. Einträge sind unveränderlich." />
      {error && <p className="mb-4 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">Protokoll konnte nicht geladen werden.</p>}
      {rows.length === 0 ? (
        <EmptyState>Keine Einträge.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Objekt</th><th>Details</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td>{r.actor_id ? (names.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : "-"}</td>
                  <td className="font-mono text-xs">{r.action}</td>
                  <td className="text-xs">{r.entity}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</td>
                  <td className="max-w-xs truncate font-mono text-xs text-gray-600">
                    {Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
