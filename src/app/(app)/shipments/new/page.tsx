import { requireRole } from "@/lib/auth";
import { getDepartments, getDirectory, getLocations, locationLabel } from "@/lib/data";
import ActionForm from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { createShipmentAction } from "@/app/actions/shipments";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  METHOD_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  SHIPPING_METHODS,
  SHIPMENT_TYPES,
  TYPE_LABELS,
} from "@/lib/constants";
import { isStaff } from "@/lib/permissions";

export const metadata = { title: "Sendung erfassen" };

export default async function NewShipmentPage() {
  const { profile } = await requireRole(["administrator", "poststelle", "mitarbeiter", "abteilungsleiter"]);
  const [directory, departments, locations] = await Promise.all([
    getDirectory(),
    getDepartments(),
    getLocations(),
  ]);
  const staff = isStaff(profile.role);
  const directions = staff ? DIRECTIONS : DIRECTIONS.filter((d) => d !== "eingehend");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Sendung erfassen"
        subtitle="Die Sendungsnummer (PO-JJJJ-NNNNNN) wird automatisch vergeben."
      />
      <div className="card">
        <ActionForm action={createShipmentAction} submitLabel="Sendung anlegen" buttonClassName="btn-primary btn-lg">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="direction" className="label">Richtung</label>
              <select id="direction" name="direction" className="input" defaultValue={staff ? "eingehend" : "ausgehend"}>
                {directions.map((d) => (
                  <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="type" className="label">Sendungsart</label>
              <select id="type" name="type" className="input" defaultValue="brief">
                {SHIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="method" className="label">Versandart</label>
              <select id="method" name="method" className="input" defaultValue="hauspost">
                {SHIPPING_METHODS.map((m) => (
                  <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="priority" className="label">Priorität</label>
              <select id="priority" name="priority" className="input" defaultValue="normal">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="label">Betreff</label>
            <input id="subject" name="subject" required maxLength={200} className="input" />
          </div>
          <div>
            <label htmlFor="description" className="label">Beschreibung (optional)</label>
            <textarea id="description" name="description" rows={3} maxLength={4000} className="input" />
          </div>

          <fieldset className="grid gap-4 rounded-lg border border-brand-border p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-bold">Absender</legend>
            <div>
              <label htmlFor="senderName" className="label">Absendername (extern oder frei)</label>
              <input
                id="senderName"
                name="senderName"
                maxLength={160}
                className="input"
                placeholder={staff ? "z. B. Firma Muster GmbH" : "Leer = Ihr eigener Name"}
              />
            </div>
            {staff && (
              <div>
                <label htmlFor="senderProfileId" className="label">Interner Absender (optional)</label>
                <select id="senderProfileId" name="senderProfileId" className="input" defaultValue="">
                  <option value="">- extern / nicht zutreffend -</option>
                  {directory.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          <fieldset className="grid gap-4 rounded-lg border border-brand-border p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-bold">Empfänger</legend>
            <div>
              <label htmlFor="recipientId" className="label">Interner Empfänger</label>
              <select id="recipientId" name="recipientId" className="input" defaultValue="">
                <option value="">- keiner (Name unten eingeben) -</option>
                {directory.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="recipientName" className="label">Empfängername (falls extern)</label>
              <input id="recipientName" name="recipientName" maxLength={160} className="input" />
            </div>
            <div>
              <label htmlFor="recipientDepartmentId" className="label">Empfängerabteilung</label>
              <select id="recipientDepartmentId" name="recipientDepartmentId" className="input" defaultValue="">
                <option value="">- aus Empfänger übernehmen / keine -</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="locationId" className="label">Zielort (Gebäude/Etage/Raum)</label>
              <select id="locationId" name="locationId" className="input" defaultValue="">
                <option value="">- unbekannt -</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{locationLabel(l)}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-brand-border p-3">
            <input type="checkbox" name="confidential" className="h-5 w-5" />
            <span>
              <span className="block text-sm font-bold">Vertraulich</span>
              <span className="block text-xs text-gray-600">
                Nur Empfänger, Ersteller, Poststelle und ausdrücklich freigegebene Personen sehen die Sendung.
              </span>
            </span>
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
