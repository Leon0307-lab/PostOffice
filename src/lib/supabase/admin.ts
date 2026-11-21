import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-Role-Client. UMGEHT Row Level Security!
 * Nur serverseitig und ausschließlich NACH ausdrücklicher Berechtigungsprüfung verwenden
 * (Dateispeicher, Benutzerverwaltung, Audit-Log). Der Schlüssel hat bewusst
 * KEIN NEXT_PUBLIC_-Präfix und gelangt nie in den Browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
