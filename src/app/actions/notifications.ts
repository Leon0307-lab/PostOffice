"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import type { ActionState } from "@/types";

export async function markNotificationsReadAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { ok: false, message: "Bitte erneut anmelden." };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  // RLS beschränkt das Update auf eigene Benachrichtigungen.
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (id && id !== "all") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Ungültige Benachrichtigung." };
    query = query.eq("id", id);
  }
  const { error } = await query;
  if (error) {
    logServerError("markNotificationsRead", error);
    return { ok: false, message: "Konnte nicht als gelesen markiert werden." };
  }
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}
