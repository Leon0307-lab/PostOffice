import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getShipmentById } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/ActionForm";
import SignaturePad from "@/components/SignaturePad";
import { PageHeader } from "@/components/ui";
import { deliverAction } from "@/app/actions/delivery";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Zustellung" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DeliverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireUser();

  const shipment = await getShipmentById(id);
  if (!shipment) notFound();

  const supabase = await createClient();
  const { data: canProcess } = await supabase.rpc("po_can_process_shipment", { p_shipment: id });
  if (canProcess !== true) redirect(`/shipments/${id}`);

  const pickup = shipment.status === "abholbereit";
  const deliverable = shipment.status === "in_zustellung" || pickup;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={pickup ? "Abholung ausgeben" : "Zustellung bestätigen"} />
      <div className="card mb-4">
        <p className="font-mono text-3xl font-extrabold">{shipment.shipment_number}</p>
        <div className="mt-2">
          <StatusBadge status={shipment.status} />
        </div>
        <p className="mt-3 text-sm text-gray-600">Empfänger laut Sendung:</p>
        <p className="text-xl font-bold">{shipment.recipient_name}</p>
        {shipment.confidential && (
          <p className="mt-2 rounded bg-brand-anthracite px-3 py-2 text-sm font-bold text-brand-yellow">
            Vertraulich - nur persönlich aushändigen
          </p>
        )}
      </div>

      {!deliverable ? (
        <div className="card text-sm">
          Diese Sendung kann im Status „{shipment.status}“ nicht zugestellt werden.{" "}
          <Link href={`/shipments/${id}`} className="font-semibold underline">
            Zurück zur Sendung
          </Link>
        </div>
      ) : (
        <div className="card">
          <ActionForm action={deliverAction} submitLabel="Zustellung bestätigen" buttonClassName="btn-primary btn-lg w-full">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
              <li>Sendung geprüft und Empfänger identifiziert</li>
              <li>Name der empfangenden Person erfassen</li>
              <li>Unterschrift auf dem Touchscreen</li>
            </ol>
            <div>
              <label htmlFor="recipientName" className="label">Name der empfangenden Person</label>
              <input
                id="recipientName"
                name="recipientName"
                required
                minLength={2}
                maxLength={160}
                defaultValue={shipment.recipient_name}
                className="input"
                autoComplete="off"
              />
            </div>
            {pickup && (
              <div>
                <label htmlFor="pickupCode" className="label">Abholcode</label>
                <input
                  id="pickupCode"
                  name="pickupCode"
                  required
                  maxLength={12}
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="XXXX-XXXX"
                  className="input font-mono text-xl uppercase tracking-widest"
                />
              </div>
            )}
            <div>
              <span className="label">Unterschrift (Pflicht)</span>
              <SignaturePad name="signature" />
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
