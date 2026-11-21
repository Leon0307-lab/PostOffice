import { requireRole } from "@/lib/auth";
import { getSetting } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { saveSettingsAction } from "@/app/actions/admin";

export const metadata = { title: "Einstellungen" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole(["administrator"]);
  const [org, ttl] = await Promise.all([
    getSetting<string>("organization_name", "Meine Organisation"),
    getSetting<number>("pickup_code_ttl_hours", 72),
  ]);

  return (
    <div className="max-w-xl">
      <PageHeader title="Systemeinstellungen" />
      <div className="card">
        <ActionForm action={saveSettingsAction} submitLabel="Speichern" buttonClassName="btn-primary">
          <div>
            <label htmlFor="org" className="label">Name der Organisation</label>
            <input id="org" name="organizationName" defaultValue={org} required maxLength={120} className="input" />
            <p className="mt-1 text-xs text-gray-500">Erscheint auf Empfangsbestätigungen.</p>
          </div>
          <div>
            <label htmlFor="ttl" className="label">Gültigkeit Abholcodes (Stunden)</label>
            <input id="ttl" name="pickupCodeTtlHours" type="number" min={1} max={336} defaultValue={ttl} required className="input" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
