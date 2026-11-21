import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartments } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import type { Profile } from "@/types";

export const metadata = { title: "Benutzer" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole(["administrator"]);
  const departments = await getDepartments();
  // Vollständige Benutzerliste (inkl. inaktiver) nur für Administratoren, nach Rollenprüfung oben.
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id,email,full_name,role,department_id,location_id,is_active,created_at")
    .order("full_name");
  const users = (data ?? []) as Profile[];

  return (
    <div className="space-y-8">
      <PageHeader title="Benutzerverwaltung" subtitle="Jeder Mitarbeiter erhält ein eigenes Konto." />

      <section className="card max-w-3xl">
        <h2 className="mb-3 text-lg font-bold">Neuen Benutzer anlegen</h2>
        <ActionForm action={createUserAction} submitLabel="Benutzer anlegen" buttonClassName="btn-primary" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="n-name">Name</label>
              <input id="n-name" name="fullName" required minLength={2} maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-email">E-Mail</label>
              <input id="n-email" name="email" type="email" required className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="n-role">Rolle</label>
              <select id="n-role" name="role" defaultValue="mitarbeiter" className="input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="n-dept">Abteilung</label>
              <select id="n-dept" name="departmentId" defaultValue="" className="input">
                <option value="">- keine -</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="n-pw">Start-Passwort (mind. 12 Zeichen)</label>
              <input id="n-pw" name="password" type="password" required minLength={12} maxLength={200} className="input" autoComplete="new-password" />
            </div>
          </div>
        </ActionForm>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Benutzer ({users.length})</h2>
        <div className="space-y-3">
          {users.map((u) => (
            <ActionForm
              key={u.id}
              action={updateUserAction}
              submitLabel="Speichern"
              buttonClassName="btn-dark"
              className="card grid items-end gap-3 !p-4 md:grid-cols-6"
            >
              <input type="hidden" name="profileId" value={u.id} />
              <div className="md:col-span-2">
                <label className="label" htmlFor={`name-${u.id}`}>Name</label>
                <input id={`name-${u.id}`} name="fullName" defaultValue={u.full_name} required minLength={2} maxLength={120} className="input" />
                <p className="mt-1 truncate text-xs text-gray-500">{u.email}</p>
              </div>
              <div>
                <label className="label" htmlFor={`role-${u.id}`}>Rolle</label>
                <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="input">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`dept-${u.id}`}>Abteilung</label>
                <select id={`dept-${u.id}`} name="departmentId" defaultValue={u.department_id ?? ""} className="input">
                  <option value="">- keine -</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" name="isActive" defaultChecked={u.is_active} className="h-5 w-5" />
                <span className="text-sm font-semibold">Aktiv</span>
              </label>
            </ActionForm>
          ))}
        </div>
      </section>
    </div>
  );
}
