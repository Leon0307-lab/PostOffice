import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { formatDateTime } from "@/lib/format";
import type { NotificationRow } from "@/types";

export const metadata = { title: "Benachrichtigungen" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id,type,title,body,shipment_id,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as NotificationRow[];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Benachrichtigungen"
        subtitle={`${unread} ungelesen`}
        actions={
          unread > 0 ? (
            <ActionForm action={markNotificationsReadAction} submitLabel="Alle als gelesen markieren" buttonClassName="btn-secondary" className="">
              <input type="hidden" name="id" value="all" />
            </ActionForm>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState>Keine Benachrichtigungen.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`card !p-4 ${n.read_at ? "opacity-70" : "border-l-4 border-l-brand-yellow"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="text-sm text-gray-700">{n.body}</p>}
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(n.created_at)}</p>
                  {n.shipment_id && (
                    <Link href={`/shipments/${n.shipment_id}`} className="mt-1 inline-block text-sm font-semibold underline">
                      Sendung öffnen
                    </Link>
                  )}
                </div>
                {!n.read_at && (
                  <ActionForm action={markNotificationsReadAction} submitLabel="Gelesen" buttonClassName="btn-secondary !min-h-[36px]" className="">
                    <input type="hidden" name="id" value={n.id} />
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
