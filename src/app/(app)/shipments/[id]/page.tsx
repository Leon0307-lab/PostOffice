import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getDirectory, getLocations, getShipmentById, locationLabel, nameMap } from "@/lib/data";
import { BarcodeImage, QrImage } from "@/components/CodeImage";
import { ConfidentialBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { Alert, EmptyState } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import {
  addNoteAction,
  archiveShipmentAction,
  assignCourierAction,
  changeStatusAction,
  grantAccessAction,
  revokeAccessAction,
  updateShipmentAction,
} from "@/app/actions/shipments";
import { createPickupCodeAction, uploadPhotoAction } from "@/app/actions/delivery";
import { formatDateTime } from "@/lib/format";
import {
  DIRECTION_LABELS,
  EVENT_TYPE_LABELS,
  METHOD_LABELS,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/constants";
import { TRANSITIONS } from "@/lib/status";
import { isStaff } from "@/lib/permissions";
import type { DocumentRow, PhotoRow, ShipmentEvent, ShipmentStatus } from "@/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ShipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; delivered?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();

  const { profile, user } = await requireUser();
  const shipment = await getShipmentById(id); // RLS: unsichtbare Sendungen -> null
  if (!shipment) notFound();

  const supabase = await createClient();
  const [eventsRes, docsRes, photosRes, grantsRes, codesRes, directory, departments, locations] = await Promise.all([
    supabase
      .from("shipment_events")
      .select("id,shipment_id,event_type,from_status,to_status,comment,actor_id,metadata,created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("documents")
      .select("id,shipment_id,kind,storage_bucket,storage_path,filename,mime_type,size_bytes,created_at")
      .eq("shipment_id", id)
      .order("created_at"),
    supabase
      .from("shipment_photos")
      .select("id,shipment_id,storage_path,category,note,mime_type,created_at")
      .eq("shipment_id", id)
      .order("created_at"),
    supabase
      .from("shipment_access_grants")
      .select("id,profile_id,expires_at,created_at")
      .eq("shipment_id", id),
    supabase
      .from("pickup_codes")
      .select("id,expires_at,used_at,created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: false })
      .limit(3),
    getDirectory(),
    getDepartments(),
    getLocations(),
  ]);

  const events = (eventsRes.data ?? []) as ShipmentEvent[];
  const docs = (docsRes.data ?? []) as DocumentRow[];
  const photos = (photosRes.data ?? []) as PhotoRow[];
  const grants = (grantsRes.data ?? []) as { id: string; profile_id: string; expires_at: string | null }[];
  const codes = (codesRes.data ?? []) as { id: string; expires_at: string; used_at: string | null; created_at: string }[];
  const names = nameMap(directory);
  const dept = departments.find((d) => d.id === shipment.recipient_department_id);
  const loc = locations.find((l) => l.id === shipment.location_id);

  const staff = isStaff(profile.role);
  const isAssignedCourier = profile.role === "zusteller" && shipment.assigned_courier_id === user.id;
  const canProcess = staff || isAssignedCourier;
  const isRecipient = shipment.recipient_id === user.id;
  const final = shipment.status === "zugestellt" || shipment.status === "zurueckgesendet";
  const couriers = directory.filter((p) => p.role === "zusteller");
  const receipt = docs.find((d) => d.kind === "empfangsbestaetigung");

  // Mögliche manuelle Statuswechsel (ohne "zugestellt"/"zugewiesen": eigene Prozesse)
  const nextStatuses = (TRANSITIONS[shipment.status] ?? []).filter((s) => {
    if (s === "zugestellt" || s === "zugewiesen") return false;
    if (["eingegangen", "abholbereit", "rueckgabe_eingeleitet", "zurueckgesendet"].includes(s)) return staff;
    return canProcess;
  });
  const needsReason = (s: ShipmentStatus) => s === "nicht_zustellbar" || s === "rueckgabe_eingeleitet";
  const canDeliver =
    (shipment.status === "in_zustellung" && canProcess) ||
    (shipment.status === "abholbereit" && staff);
  const canAssign = staff && ["eingegangen", "zugewiesen", "nicht_zustellbar"].includes(shipment.status);

  return (
    <div className="space-y-6">
      {sp.created && <Alert tone="ok">Sendung wurde angelegt.</Alert>}
      {sp.delivered && <Alert tone="ok">Zustellung bestätigt. Die Empfangsbestätigung wurde archiviert.</Alert>}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-4xl font-extrabold tracking-tight sm:text-5xl">{shipment.shipment_number}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={shipment.status} />
            <PriorityBadge priority={shipment.priority} />
            {shipment.confidential && <ConfidentialBadge />}
            {shipment.archived_at && <span className="badge bg-gray-200 text-gray-700">Archiviert</span>}
          </div>
          <p className="mt-3 text-lg font-semibold">{shipment.subject}</p>
        </div>
        <div className="flex items-center gap-4">
          <BarcodeImage value={shipment.shipment_number} />
          <QrImage value={shipment.shipment_number} size={88} />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {canDeliver && (
          <Link href={`/shipments/${shipment.id}/deliver`} className="btn-primary btn-lg">
            {shipment.status === "abholbereit" ? "Abholung ausgeben" : "Zustellung mit Unterschrift"}
          </Link>
        )}
        {staff && (
          <a href={`/api/labels?ids=${shipment.id}&mode=single&position=1`} target="_blank" rel="noreferrer" className="btn-secondary">
            Etikett drucken
          </a>
        )}
        {receipt && (
          <a href={`/api/files/document/${receipt.id}`} target="_blank" rel="noreferrer" className="btn-dark">
            Empfangsbestätigung (PDF)
          </a>
        )}
        {shipment.status === "zugestellt" && !receipt && (
          <a href={`/api/receipt/${shipment.id}`} target="_blank" rel="noreferrer" className="btn-dark">
            Empfangsbestätigung erzeugen
          </a>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Details</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Info label="Richtung" value={DIRECTION_LABELS[shipment.direction]} />
            <Info label="Sendungsart" value={TYPE_LABELS[shipment.shipment_type]} />
            <Info label="Versandart" value={METHOD_LABELS[shipment.shipping_method]} />
            <Info label="Absender" value={shipment.sender_name} />
            <Info label="Empfänger" value={shipment.recipient_name} />
            <Info label="Abteilung" value={dept?.name ?? "-"} />
            <Info label="Zielort" value={locationLabel(loc) || "-"} />
            <Info label="Zusteller" value={shipment.assigned_courier_id ? (names.get(shipment.assigned_courier_id) ?? "-") : "-"} />
            <Info label="Erstellt von" value={names.get(shipment.created_by) ?? "-"} />
            <Info label="Erstellt am" value={formatDateTime(shipment.created_at)} />
            {shipment.delivered_at && <Info label="Zugestellt am" value={formatDateTime(shipment.delivered_at)} />}
            {shipment.return_reason && (
              <Info label="Grund" value={`${RETURN_REASON_LABELS[shipment.return_reason]}${shipment.return_comment ? ` - ${shipment.return_comment}` : ""}`} />
            )}
          </dl>
          {shipment.description && (
            <div className="mt-4 border-t border-brand-border pt-3">
              <p className="text-xs font-bold uppercase text-gray-500">Beschreibung</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{shipment.description}</p>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Aktionen</h2>
          <div className="space-y-5">
            {canAssign && (
              <ActionForm action={assignCourierAction} submitLabel="Zusteller zuweisen" buttonClassName="btn-dark w-full">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <div>
                  <label htmlFor="courierId" className="label">Zusteller</label>
                  <select id="courierId" name="courierId" required className="input" defaultValue={shipment.assigned_courier_id ?? ""}>
                    <option value="" disabled>Bitte wählen</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
                <input name="comment" placeholder="Kommentar (optional)" maxLength={1000} className="input" />
              </ActionForm>
            )}

            {nextStatuses.map((s) => (
              <ActionForm
                key={s}
                action={changeStatusAction}
                submitLabel={STATUS_LABELS[s]}
                buttonClassName="btn-secondary w-full"
                className="space-y-2 rounded-lg border border-brand-border p-3"
              >
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input type="hidden" name="to" value={s} />
                {needsReason(s) && (
                  <select name="reason" required className="input" defaultValue="">
                    <option value="" disabled>Grund wählen</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>{RETURN_REASON_LABELS[r]}</option>
                    ))}
                  </select>
                )}
                <input name="comment" placeholder="Kommentar (optional)" maxLength={2000} className="input" />
              </ActionForm>
            ))}

            {shipment.status === "abholbereit" && (staff || isRecipient) && (
              <ActionForm action={createPickupCodeAction} submitLabel="Abholcode erzeugen" buttonClassName="btn-dark w-full">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <p className="text-xs text-gray-600">
                  Der Code wird nur einmal angezeigt und ist einmalig verwendbar.
                </p>
              </ActionForm>
            )}

            {staff && final && !shipment.archived_at && (
              <ActionForm action={archiveShipmentAction} submitLabel="Archivieren" buttonClassName="btn-secondary w-full" confirm="Sendung archivieren?">
                <input type="hidden" name="shipmentId" value={shipment.id} />
              </ActionForm>
            )}

            {!canAssign && nextStatuses.length === 0 && !canDeliver && !(shipment.status === "abholbereit" && (staff || isRecipient)) && !(staff && final && !shipment.archived_at) && (
              <p className="text-sm text-gray-500">Keine Aktionen verfügbar.</p>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-4 text-lg font-bold">Sendungsverlauf</h2>
        {events.length === 0 ? (
          <EmptyState>Kein Verlauf vorhanden.</EmptyState>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-brand-yellow pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-brand-anthracite" />
                <p className="text-sm font-semibold">
                  {e.to_status ? STATUS_LABELS[e.to_status] : (EVENT_TYPE_LABELS[e.event_type] ?? e.event_type)}
                </p>
                {e.comment && e.comment !== (e.to_status ? STATUS_LABELS[e.to_status] : "") && (
                  <p className="text-sm text-gray-700">{e.comment}</p>
                )}
                <p className="text-xs text-gray-500">
                  {formatDateTime(e.created_at)}
                  {e.actor_id && ` · ${names.get(e.actor_id) ?? "Unbekannt"}`}
                </p>
              </li>
            ))}
          </ol>
        )}
        {canProcess && (
          <div className="mt-5 border-t border-brand-border pt-4">
            <ActionForm action={addNoteAction} submitLabel="Notiz hinzufügen" buttonClassName="btn-secondary" resetOnSuccess>
              <input type="hidden" name="shipmentId" value={shipment.id} />
              <label htmlFor="note" className="label">Notiz / Problem dokumentieren</label>
              <textarea id="note" name="comment" required rows={2} maxLength={2000} className="input" />
            </ActionForm>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Fotodokumentation</h2>
          {photos.length === 0 ? (
            <p className="text-sm text-gray-500">Noch keine Fotos.</p>
          ) : (
            <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-lg border border-brand-border">
                  <a href={`/api/files/photo/${p.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/photo/${p.id}`} alt={p.note ?? PHOTO_CATEGORY_LABELS[p.category]} className="h-28 w-full object-cover" loading="lazy" />
                  </a>
                  <p className="px-2 py-1 text-xs">{PHOTO_CATEGORY_LABELS[p.category]}</p>
                </li>
              ))}
            </ul>
          )}
          {canProcess && (
            <ActionForm action={uploadPhotoAction} submitLabel="Foto speichern" buttonClassName="btn-dark" resetOnSuccess>
              <input type="hidden" name="shipmentId" value={shipment.id} />
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="input" />
              <select name="category" className="input" defaultValue="sonstiges" aria-label="Kategorie">
                {PHOTO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{PHOTO_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              <input name="note" maxLength={1000} placeholder="Notiz (optional)" className="input" />
            </ActionForm>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Dokumente &amp; Abholcodes</h2>
          {docs.length === 0 && codes.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Dokumente.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.id}>
                  <a href={`/api/files/document/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                    {d.filename}
                  </a>{" "}
                  <span className="text-xs text-gray-500">{formatDateTime(d.created_at)}</span>
                </li>
              ))}
              {codes.map((c) => (
                <li key={c.id} className="text-gray-700">
                  Abholcode vom {formatDateTime(c.created_at)} ·{" "}
                  {c.used_at ? "eingelöst" : new Date(c.expires_at) < new Date() ? "abgelaufen" : `gültig bis ${formatDateTime(c.expires_at)}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(staff || shipment.created_by === user.id) && shipment.confidential && (
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Zugriffsfreigaben (vertraulich)</h2>
          {grants.length === 0 ? (
            <p className="mb-3 text-sm text-gray-500">Keine zusätzlichen Freigaben.</p>
          ) : (
            <ul className="mb-4 space-y-2 text-sm">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3">
                  <span>
                    {names.get(g.profile_id) ?? "Unbekannt"}
                    {g.expires_at && ` (bis ${formatDateTime(g.expires_at)})`}
                  </span>
                  <ActionForm action={revokeAccessAction} submitLabel="Entziehen" buttonClassName="btn-secondary !min-h-[36px]" className="">
                    <input type="hidden" name="grantId" value={g.id} />
                    <input type="hidden" name="shipmentId" value={shipment.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={grantAccessAction} submitLabel="Zugriff freigeben" buttonClassName="btn-dark">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="profileId" required className="input" defaultValue="" aria-label="Person">
                <option value="" disabled>Person wählen</option>
                {directory.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <input type="datetime-local" name="expiresAt" className="input" aria-label="Ablauf (optional)" />
            </div>
          </ActionForm>
        </section>
      )}

      {staff && !shipment.archived_at && !final && (
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Stammdaten bearbeiten</h2>
          <ActionForm action={updateShipmentAction} submitLabel="Speichern" buttonClassName="btn-dark">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <div>
              <label htmlFor="e-subject" className="label">Betreff</label>
              <input id="e-subject" name="subject" defaultValue={shipment.subject} required maxLength={200} className="input" />
            </div>
            <div>
              <label htmlFor="e-desc" className="label">Beschreibung</label>
              <textarea id="e-desc" name="description" defaultValue={shipment.description} rows={3} maxLength={4000} className="input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="priority" defaultValue={shipment.priority} className="input" aria-label="Priorität">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
              <label className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" name="confidential" defaultChecked={shipment.confidential} className="h-5 w-5" />
                <span className="text-sm font-semibold">Vertraulich</span>
              </label>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
