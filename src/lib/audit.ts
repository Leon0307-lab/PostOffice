import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/errors";

/**
 * Schreibt einen Audit-Eintrag mit Service-Role (nur Server).
 * Clients haben keinerlei Schreibrechte auf audit_logs. Fehler beim Protokollieren
 * dürfen die Hauptaktion nicht verhindern, werden aber im Server-Log vermerkt.
 */
export async function writeAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId,
      details,
    });
    if (error) logServerError(`audit ${action}`, error);
  } catch (e) {
    logServerError(`audit ${action}`, e);
  }
}
