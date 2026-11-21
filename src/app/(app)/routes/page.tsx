import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDirectory, getLocations, locationLabel, nameMap } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import {
  addRouteStopAction,
  createRouteAction,
  moveRouteStopAction,
  removeRouteStopAction,
  setRouteStatusAction,
} from "@/app/actions/admin";
import { formatDate, todayIso } from "@/lib/format";
import { isStaff } from "@/lib/permissions";
import type { ShipmentStatus } from "@/types";

export const metadata = { title: "Zustellrouten" };
export const dynamic = "force-dynamic";

interface RouteRow {
  id: string;
  name: string;
  courier_id: string;
  route_date: string;
  status: "geplant" | "aktiv" | "abgeschlossen";
}
interface StopRow {
  id: string;
  route_id: string;
  shipment_id: string;
  location_id: string | null;
  stop_order: number;
  status: "offen" | "zugestellt" | "uebersprungen";
}
interface ShipmentLite {
  id: string;
  shipment_number: string;
  recipient_name: string;
  status: ShipmentStatus;
  location_id: string | null;
}

const ROUTE_STATUS_LABELS = { geplant: "Geplant", aktiv: "Aktiv", abgeschlossen: "Abgeschlossen" } as const;
const STOP_LABELS = { offen: "Offen", zugestellt: "Zugestellt", uebersprungen: "Übersprungen" } as const;

export default async function RoutesPage() {
  const { profile } = await requireRole(["administrator", "poststelle", "zusteller"]);
  const staff = isStaff(profile.role);
  const supabase = await createClient();

  const [routesRes, stopsRes, directory, locations] = await Promise.all([
    supabase
      .from("delivery_routes")
      .select("id,name,courier_id,route_date,status")
      .order("route_date", { ascending: false })
      .limit(40),
    supabase
      .from("delivery_route_stops")
      .select("id,route_id,shipment_id,location_id,stop_order,status")
      .order("stop_order"),
    getDirectory(),
    getLocations(),
  ]);
  const routes = (routesRes.data ?? []) as RouteRow[];
  const stops = (stopsRes.data ?? []) as StopRow[];
  const names = nameMap(directory);
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const couriers = directory.filter((d) => d.role === "zusteller");

  const shipmentIds = [...new Set(stops.map((s) => s.shipment_id))];
  const { data: shipmentData } = shipmentIds.length
    ? await supabase
        .from("shipments")
        .select("id,shipment_number,recipient_name,status,location_id")
        .in("id", shipmentIds)
    : { data: [] };
  const shipMap = new Map(((shipmentData ?? []) as ShipmentLite[]).map((s) => [s.id, s]));

  // Zuweisbare Sendungen für neue Stopps (Poststelle)
  const { data: openData } = staff
    ? await supabase
        .from("shipments")
        .select("id,shipment_number,recipient_name,status,location_id")
        .in("status", ["zugewiesen", "uebernommen", "im_transport", "in_zustellung"])
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };
  const openShipments = (openData ?? []) as ShipmentLite[];

  return (
    <div>
      <PageHeader
        title="Zustellrouten"
        subtitle="Interne Routen nach Gebäude, Etage und Raum - ohne GPS-Navigation."
      />

      {staff && (
        <section className="card mb-8">
          <h2 className="mb-3 text-lg font-bold">Neue Route</h2>
          <ActionForm action={createRouteAction} submitLabel="Route anlegen" buttonClassName="btn-dark" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="name" required maxLength={120} placeholder="z. B. Vormittagsrunde Gebäude A" className="input" aria-label="Name" />
              <select name="courierId" required defaultValue="" className="input" aria-label="Zusteller">
                <option value="" disabled>Zusteller wählen</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
              <input name="routeDate" type="date" required defaultValue={todayIso()} className="input" aria-label="Datum" />
            </div>
          </ActionForm>
        </section>
      )}

      {routes.length === 0 ? (
        <EmptyState>Keine Routen vorhanden.</EmptyState>
      ) : (
        <div className="space-y-6">
          {routes.map((route) => {
            const routeStops = stops.filter((s) => s.route_id === route.id);
            const usedIds = new Set(routeStops.map((s) => s.shipment_id));
            return (
              <section key={route.id} className="card">
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{route.name}</h2>
                    <p className="text-sm text-gray-600">
                      {formatDate(route.route_date)} · {names.get(route.courier_id) ?? "Unbekannt"} ·{" "}
                      <span className="font-semibold">{ROUTE_STATUS_LABELS[route.status]}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {route.status === "geplant" && (
                      <ActionForm action={setRouteStatusAction} submitLabel="Starten" buttonClassName="btn-dark" className="">
                        <input type="hidden" name="routeId" value={route.id} />
                        <input type="hidden" name="status" value="aktiv" />
                      </ActionForm>
                    )}
                    {route.status === "aktiv" && (
                      <ActionForm action={setRouteStatusAction} submitLabel="Abschließen" buttonClassName="btn-primary" className="">
                        <input type="hidden" name="routeId" value={route.id} />
                        <input type="hidden" name="status" value="abgeschlossen" />
                      </ActionForm>
                    )}
                  </div>
                </header>

                {routeStops.length === 0 ? (
                  <p className="text-sm text-gray-500">Noch keine Stopps.</p>
                ) : (
                  <ol className="space-y-2">
                    {routeStops.map((stop, idx) => {
                      const ship = shipMap.get(stop.shipment_id);
                      const loc = locMap.get(stop.location_id ?? ship?.location_id ?? "");
                      return (
                        <li key={stop.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-border p-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-yellow font-extrabold">
                            {stop.stop_order}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link href={`/shipments/${stop.shipment_id}`} className="font-mono font-bold underline">
                              {ship?.shipment_number ?? "Sendung"}
                            </Link>
                            <p className="text-sm">
                              {ship?.recipient_name ?? ""} · {locationLabel(loc) || "Ort unbekannt"}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-gray-600">{STOP_LABELS[stop.status]}</span>
                          {ship && <StatusBadge status={ship.status} />}
                          {staff && (
                            <div className="flex gap-1">
                              {idx > 0 && (
                                <ActionForm action={moveRouteStopAction} submitLabel="↑" buttonClassName="btn-secondary !min-w-[44px]" className="">
                                  <input type="hidden" name="stopId" value={stop.id} />
                                  <input type="hidden" name="direction" value="up" />
                                </ActionForm>
                              )}
                              {idx < routeStops.length - 1 && (
                                <ActionForm action={moveRouteStopAction} submitLabel="↓" buttonClassName="btn-secondary !min-w-[44px]" className="">
                                  <input type="hidden" name="stopId" value={stop.id} />
                                  <input type="hidden" name="direction" value="down" />
                                </ActionForm>
                              )}
                              <ActionForm action={removeRouteStopAction} submitLabel="Entfernen" buttonClassName="btn-secondary" className="" confirm="Stopp entfernen?">
                                <input type="hidden" name="stopId" value={stop.id} />
                              </ActionForm>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {staff && route.status !== "abgeschlossen" && (
                  <div className="mt-4 border-t border-brand-border pt-4">
                    <ActionForm action={addRouteStopAction} submitLabel="Stopp hinzufügen" buttonClassName="btn-dark">
                      <input type="hidden" name="routeId" value={route.id} />
                      <select name="shipmentId" required defaultValue="" className="input" aria-label="Sendung">
                        <option value="" disabled>Sendung als Stopp wählen</option>
                        {openShipments
                          .filter((s) => !usedIds.has(s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.shipment_number} · {s.recipient_name} · {locationLabel(s.location_id ? locMap.get(s.location_id) : null) || "Ort unbekannt"}
                            </option>
                          ))}
                      </select>
                    </ActionForm>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
