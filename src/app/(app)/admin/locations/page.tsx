import { requireRole } from "@/lib/auth";
import { getDepartments, getLocations } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { saveLocationAction } from "@/app/actions/admin";

export const metadata = { title: "Standorte" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  await requireRole(["administrator", "poststelle"]);
  const [locations, departments] = await Promise.all([getLocations(), getDepartments()]);

  const fields = (l?: (typeof locations)[number]) => (
    <>
      {l && <input type="hidden" name="id" value={l.id} />}
      <div className="grid items-end gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Gebäude</label>
          <input name="building" defaultValue={l?.building ?? ""} required maxLength={80} className="input" />
        </div>
        <div>
          <label className="label">Etage</label>
          <input name="floor" defaultValue={l?.floor ?? ""} maxLength={40} className="input" />
        </div>
        <div>
          <label className="label">Raum</label>
          <input name="room" defaultValue={l?.room ?? ""} maxLength={40} className="input" />
        </div>
        <div>
          <label className="label">Abteilung</label>
          <select name="departmentId" defaultValue={l?.department_id ?? ""} className="input">
            <option value="">- keine -</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader title="Standorte" subtitle="Gebäude, Etage und Raum für die interne Routenplanung." />
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Neuer Standort</h2>
        <ActionForm action={saveLocationAction} submitLabel="Anlegen" buttonClassName="btn-primary" resetOnSuccess>
          {fields()}
        </ActionForm>
      </section>
      <section className="space-y-3">
        {locations.map((l) => (
          <ActionForm key={l.id} action={saveLocationAction} submitLabel="Speichern" buttonClassName="btn-dark" className="card space-y-3 !p-4">
            {fields(l)}
          </ActionForm>
        ))}
      </section>
    </div>
  );
}
