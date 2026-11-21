"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { firstError, formToObject, loginSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/types";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  return value;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obj = formToObject(formData);
  const parsed = loginSchema.safeParse(obj);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    await writeAudit(null, "auth.login_failed", "auth", null, { email: parsed.data.email });
    // Bewusst unspezifisch (kein Hinweis, ob die E-Mail existiert).
    return { ok: false, message: "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, message: "Dieses Benutzerkonto ist nicht aktiv." };
  }

  await writeAudit(data.user.id, "auth.login", "auth", data.user.id);
  redirect(safeNext(obj.next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
