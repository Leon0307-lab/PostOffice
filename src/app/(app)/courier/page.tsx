import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocations, locationLabel, SHIPMENT_COLUMNS } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfidentialBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import ActionForm from "@/components/ActionForm";
import { changeStatusAction } from "@/app/actions/shipments";
import type { Shipment, ShipmentStatus } from "@/types";

export const metadata = { title: "Meine Zustellungen" };
export const dynamic = "force-dynamic";

const SECTIONS: Array<{ title: string; statuses: ShipmentStatus[] }> = [
  { title: "Neue Zuweisungen", statuses: ["zugewiesen"] },
  { title: "Abzuholende Sendungen", statuses: ["uebernommen"] },
  { title: "Sendungen in Zustellung", statuses: ["im_transport", "in_zustellung"] },
  { title: "Erfolgreich zugestellt", statuses: ["zugestellt"] },
  { title: "Nicht zustellbar", statuses: ["nicht_zustellbar"] },
  { title: "Rücksendungen", statuses: ["rueckgabe_eingeleitet", "zurueckgesendet"] },
];

export default async function CourierPage() {
  const { user } = await requireRole(["zusteller"]);
  const supabase = await createClient();
  const [{ data }, locations] = await Promise.all([
    supabase
      .from("shipments")
      .select(SHIPMENT_COLUMNS)
      .eq("assigned_courier_id", user.id)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(300),
    getLocations(),
  ]);
  const shipments = (data ?? []) as Shipment[];
  const locMap = new Map(locations.map((l) => [l.id, l]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Meine Sendungen" subtitle={`${shipments.length} zugewiesen`} actions={<Link href="/scan" className="btn-dark btn-lg">Scannen</Link>} />

      <div className="space-y-8">
        {SECTIONS.map((section) => {
          const items = shipments.filter((s) => section.statuses.includes(s.status));
          // Erledigte Abschnitte kompakt halten.
          const shown = section.statuses.includes("zugestellt") ? items.slice(-10).reverse() : items;
          return (
            <section key={section.title}>
              <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
                {section.title}
                <span className="rounded-full bg-brand-anthracite px-3 py-0.5 text-sm text-white">{items.length}</span>
              </h2>
              {shown.length === 0 ? (
                <EmptyState>Keine Sendungen.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {shown.map((s) => (
                    <li key={s.id} className="card !p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/shipments/${s.id}`} className="font-mono text-2xl font-extrabold underline">
                          {s.shipment_number}
                        </Link>
                        <PriorityBadge priority={s.priority} />
                      </div>
                      <p className="mt-1 font-semibold">{s.recipient_name}</p>
                      <p className="text-sm text-gray-600">
                        {locationLabel(s.location_id ? locMap.get(s.location_id) : null) || "Ort unbekannt"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge status={s.status} />
                        {s.confidential && <ConfidentialBadge />}
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        {s.status === "zugewiesen" && (
                          <ActionForm action={changeStatusAction} submitLabel="Übernehmen" buttonClassName="btn-dark btn-lg w-full" className="">
                            <input type="hidden" name="shipmentId" value={s.id} />
                            <input type="hidden" name="to" value="uebernommen" />
                          </ActionForm>
                        )}
                        {(s.status === "uebernommen" || s.status === "im_transport") && (
                          <ActionForm action={changeStatusAction} submitLabel="Zustellung starten" buttonClassName="btn-dark btn-lg w-full" className="">
                            <input type="hidden" name="shipmentId" value={s.id} />
                            <input type="hidden" name="to" value="in_zustellung" />
                          </ActionForm>
                        )}
                        {s.status === "in_zustellung" && (
                          <Link href={`/shipments/${s.id}/deliver`} className="btn-primary btn-lg w-full">
                            Zustellen &amp; unterschreiben
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
