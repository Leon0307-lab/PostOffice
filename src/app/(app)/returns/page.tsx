import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SHIPMENT_COLUMNS } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import ActionForm from "@/components/ActionForm";
import { changeStatusAction } from "@/app/actions/shipments";
import { formatDateTime } from "@/lib/format";
import { RETURN_REASON_LABELS } from "@/lib/constants";
import type { Shipment } from "@/types";

export const metadata = { title: "Rücksendungen" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  await requireRole(["administrator", "poststelle"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .in("status", ["nicht_zustellbar", "rueckgabe_eingeleitet", "zurueckgesendet"])
    .order("updated_at", { ascending: false })
    .limit(100);
  const shipments = (data ?? []) as Shipment[];

  return (
    <div>
      <PageHeader
        title="Rücksendungen"
        subtitle="Nicht zustellbare Sendungen bearbeiten, zurücksenden oder erneut zuweisen."
      />
      {shipments.length === 0 ? (
        <EmptyState>Keine nicht zustellbaren oder zurückgesendeten Sendungen.</EmptyState>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <article key={s.id} className="card !p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/shipments/${s.id}`} className="font-mono text-2xl font-extrabold underline">
                    {s.shipment_number}
                  </Link>
                  <p className="text-sm text-gray-700">
                    {s.recipient_name} · aktualisiert {formatDateTime(s.updated_at)}
                  </p>
                  {s.return_reason && (
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">Grund:</span> {RETURN_REASON_LABELS[s.return_reason]}
                      {s.return_comment ? ` - ${s.return_comment}` : ""}
                    </p>
                  )}
                </div>
                <StatusBadge status={s.status} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {s.status === "nicht_zustellbar" && (
                  <>
                    <Link href={`/shipments/${s.id}`} className="btn-secondary">
                      Erneut zuweisen
                    </Link>
                    <ActionForm action={changeStatusAction} submitLabel="Zur Abholung bereitstellen" buttonClassName="btn-secondary" className="">
                      <input type="hidden" name="shipmentId" value={s.id} />
                      <input type="hidden" name="to" value="abholbereit" />
                    </ActionForm>
                    <ActionForm
                      action={changeStatusAction}
                      submitLabel="Rücksendung einleiten"
                      buttonClassName="btn-dark"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="shipmentId" value={s.id} />
                      <input type="hidden" name="to" value="rueckgabe_eingeleitet" />
                      <input type="hidden" name="reason" value={s.return_reason ?? "sonstiges"} />
                      <input name="comment" maxLength={2000} placeholder="Kommentar" className="input !w-56" aria-label="Kommentar" />
                    </ActionForm>
                  </>
                )}
                {s.status === "rueckgabe_eingeleitet" && (
                  <ActionForm
                    action={changeStatusAction}
                    submitLabel="Als zurückgesendet abschließen"
                    buttonClassName="btn-primary"
                    className="flex flex-wrap items-center gap-2"
                    confirm="Rücksendung abschließen? Danach ist die Sendung nicht mehr änderbar."
                  >
                    <input type="hidden" name="shipmentId" value={s.id} />
                    <input type="hidden" name="to" value="zurueckgesendet" />
                    <input name="comment" maxLength={2000} placeholder="Kommentar" className="input !w-56" aria-label="Kommentar" />
                  </ActionForm>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
