import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDirectory, nameMap, SHIPMENT_COLUMNS } from "@/lib/data";
import { PageHeader, StatCard, EmptyState, Alert } from "@/components/ui";
import { ConfidentialBadge, StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { EVENT_TYPE_LABELS, ROLE_LABELS } from "@/lib/constants";
import type { NotificationRow, Shipment, ShipmentEvent } from "@/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

interface Counts {
  total: number;
  incoming: number;
  outgoing: number;
  undelivered: number;
  delivered: number;
  returns: number;
  problems: number;
  open_tasks: number;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireUser();
  const { error } = await searchParams;
  const supabase = await createClient();

  // Alle Kennzahlen stammen aus echten Datenbankabfragen; RLS begrenzt sie auf sichtbare Sendungen.
  const [countsRes, latestRes, activityRes, notifRes, directory] = await Promise.all([
    supabase.rpc("po_dashboard_counts"),
    supabase
      .from("shipments")
      .select(SHIPMENT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("shipment_events")
      .select("id,shipment_id,event_type,from_status,to_status,comment,actor_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("notifications")
      .select("id,type,title,body,shipment_id,read_at,created_at")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    getDirectory(),
  ]);

  const counts = (countsRes.data ?? null) as Counts | null;
  const latest = (latestRes.data ?? []) as Shipment[];
  const activity = (activityRes.data ?? []) as ShipmentEvent[];
  const notifications = (notifRes.data ?? []) as NotificationRow[];
  const names = nameMap(directory);

  const taskLabel =
    profile.role === "zusteller"
      ? "Offene Zustellungen"
      : profile.role === "administrator" || profile.role === "poststelle"
        ? "Offene Aufgaben (Poststelle)"
        : "Zur Abholung bereit";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Willkommen, ${profile.full_name || profile.email} · ${ROLE_LABELS[profile.role]}`}
      />
      {error === "forbidden" && <Alert tone="bad">Für diesen Bereich fehlt Ihnen die Berechtigung.</Alert>}
      {countsRes.error && <Alert tone="bad">Kennzahlen konnten nicht geladen werden.</Alert>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sendungen insgesamt" value={counts?.total ?? 0} />
        <StatCard label="Eingegangen" value={counts?.incoming ?? 0} tone="info" />
        <StatCard label="Ausgehend" value={counts?.outgoing ?? 0} tone="info" />
        <StatCard label="Noch nicht zugestellt" value={counts?.undelivered ?? 0} />
        <StatCard label="Zugestellt" value={counts?.delivered ?? 0} tone="ok" />
        <StatCard label="Rücksendungen" value={counts?.returns ?? 0} />
        <StatCard label="Problematisch" value={counts?.problems ?? 0} tone="bad" />
        <StatCard label={taskLabel} value={counts?.open_tasks ?? 0} tone="info" />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Neueste Sendungen</h2>
          {latest.length === 0 ? (
            <EmptyState>Noch keine Sendungen vorhanden.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nummer</th>
                    <th>Betreff</th>
                    <th>Empfänger</th>
                    <th>Status</th>
                    <th>Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/shipments/${s.id}`} className="font-mono font-bold underline">
                          {s.shipment_number}
                        </Link>
                      </td>
                      <td>
                        {s.confidential ? <ConfidentialBadge /> : s.subject}
                      </td>
                      <td>{s.recipient_name}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-bold">Benachrichtigungen</h2>
            {notifications.length === 0 ? (
              <EmptyState>Keine ungelesenen Benachrichtigungen.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li key={n.id} className="card !p-3">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/notifications" className="mt-2 inline-block text-sm font-semibold underline">
              Alle anzeigen
            </Link>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Aktuelle Zustellaktivitäten</h2>
            {activity.length === 0 ? (
              <EmptyState>Noch keine Aktivitäten.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {activity.map((e) => (
                  <li key={e.id} className="card !p-3 text-sm">
                    <Link href={`/shipments/${e.shipment_id}`} className="font-semibold underline">
                      {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                    </Link>
                    {e.comment && <p className="text-xs text-gray-600">{e.comment}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDateTime(e.created_at)}
                      {e.actor_id && names.get(e.actor_id) ? ` · ${names.get(e.actor_id)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
