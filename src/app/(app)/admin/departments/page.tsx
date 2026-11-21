import { requireRole } from "@/lib/auth";
import { getDepartments, getDirectory } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { saveDepartmentAction } from "@/app/actions/admin";

export const metadata = { title: "Abteilungen" };
export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireRole(["administrator"]);
  const [departments, directory] = await Promise.all([getDepartments(), getDirectory()]);

  const fields = (d?: (typeof departments)[number]) => (
    <>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid items-end gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Name</label>
          <input name="name" defaultValue={d?.name ?? ""} required maxLength={120} className="input" />
        </div>
        <div>
          <label className="label">Kürzel</label>
          <input name="code" defaultValue={d?.code ?? ""} required maxLength={20} className="input uppercase" />
        </div>
        <div>
          <label className="label">Abteilungsverantwortlicher</label>
          <select name="headProfileId" defaultValue={d?.head_profile_id ?? ""} className="input">
            <option value="">- keiner -</option>
            {directory.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Abteilungen" />
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Neue Abteilung</h2>
        <ActionForm action={saveDepartmentAction} submitLabel="Anlegen" buttonClassName="btn-primary" resetOnSuccess>
          {fields()}
        </ActionForm>
      </section>
      <section className="space-y-3">
        {departments.map((d) => (
          <ActionForm key={d.id} action={saveDepartmentAction} submitLabel="Speichern" buttonClassName="btn-dark" className="card space-y-3 !p-4">
            {fields(d)}
          </ActionForm>
        ))}
      </section>
    </div>
  );
}
