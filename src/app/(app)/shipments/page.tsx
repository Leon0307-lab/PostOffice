import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, SHIPMENT_COLUMNS } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfidentialBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  TYPE_LABELS,
} from "@/lib/constants";
import { canCreateShipment, canPrintLabels } from "@/lib/permissions";
import type { Shipment, ShipmentDirection, ShipmentStatus } from "@/types";

export const metadata = { title: "Sendungen" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  status?: string;
  direction?: string;
  page?: string;
}

/** Entfernt Zeichen mit Bedeutung in PostgREST-Filtern (kein Filter-Injection). */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80);
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const q = sanitizeSearch(sp.q ?? "");
  const status = STATUS_ORDER.includes(sp.status as ShipmentStatus) ? (sp.status as ShipmentStatus) : "";
  const direction = DIRECTIONS.includes(sp.direction as ShipmentDirection)
    ? (sp.direction as ShipmentDirection)
    : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS, { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (direction) query = query.eq("direction", direction);
  if (q) {
    query = query.or(
      `shipment_number.ilike.%${q}%,subject.ilike.%${q}%,recipient_name.ilike.%${q}%,sender_name.ilike.%${q}%`
    );
  }
  const { data, count, error } = await query;
  const shipments = (data ?? []) as Shipment[];
  const departments = await getDepartments();
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const printable = canPrintLabels(profile.role);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (direction) params.set("direction", direction);
    params.set("page", String(p));
    return `/shipments?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Sendungen"
        subtitle={`${count ?? 0} Sendungen`}
        actions={
          canCreateShipment(profile.role) ? (
            <Link href="/shipments/new" className="btn-primary">
              Sendung erfassen
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="card mb-4 grid gap-3 !p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Nummer, Betreff, Name …" className="input" aria-label="Suche" />
        <select name="status" defaultValue={status} className="input" aria-label="Status">
          <option value="">Alle Status</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="direction" defaultValue={direction} className="input" aria-label="Richtung">
          <option value="">Alle Richtungen</option>
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {DIRECTION_LABELS[d]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-dark">
          Filtern
        </button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">Sendungen konnten nicht geladen werden.</p>}

      <form method="get" action="/api/labels" target="_blank">
        {printable && (
          <div className="card mb-4 flex flex-wrap items-end gap-3 !p-4">
            <div>
              <label htmlFor="mode" className="label">
                Etiketten (DIN A4)
              </label>
              <select id="mode" name="mode" className="input" defaultValue="sheet">
                <option value="sheet">Mehrere pro Seite (8)</option>
                <option value="single">Einzelnes Etikett</option>
              </select>
            </div>
            <div>
              <label htmlFor="position" className="label">
                Startposition (1-8)
              </label>
              <input id="position" name="position" type="number" min={1} max={8} defaultValue={1} className="input w-24" />
            </div>
            <button type="submit" className="btn-secondary">
              Markierte Etiketten drucken
            </button>
          </div>
        )}

        {shipments.length === 0 ? (
          <EmptyState>Keine Sendungen gefunden.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {printable && <th aria-label="Auswahl" />}
                  <th>Nummer</th>
                  <th>Betreff</th>
                  <th>Empfänger</th>
                  <th>Abteilung</th>
                  <th>Art</th>
                  <th>Priorität</th>
                  <th>Status</th>
                  <th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id}>
                    {printable && (
                      <td>
                        <input type="checkbox" name="ids" value={s.id} className="h-5 w-5" aria-label={`${s.shipment_number} auswählen`} />
                      </td>
                    )}
                    <td>
                      <Link href={`/shipments/${s.id}`} className="font-mono font-bold underline">
                        {s.shipment_number}
                      </Link>
                    </td>
                    <td className="max-w-[240px] truncate">{s.confidential ? <ConfidentialBadge /> : s.subject}</td>
                    <td>{s.recipient_name}</td>
                    <td>{s.recipient_department_id ? (deptName.get(s.recipient_department_id) ?? "-") : "-"}</td>
                    <td>{TYPE_LABELS[s.shipment_type]}</td>
                    <td>
                      <PriorityBadge priority={s.priority} />
                    </td>
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
      </form>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Seiten">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-secondary">
              Zurück
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-600">
            Seite {page} von {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="btn-secondary">
              Weiter
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
