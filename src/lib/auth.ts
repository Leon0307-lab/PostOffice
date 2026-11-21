import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types";

export interface CurrentUser {
  user: User;
  profile: Profile;
}

/** Aktueller Benutzer inkl. Profil; null, wenn nicht angemeldet oder deaktiviert. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,department_id,location_id,is_active,created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || !profile.is_active) return null;
  return { user, profile: profile as Profile };
});

export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

/** Serverseitige Rollenprüfung. Ohne passende Rolle: Weiterleitung zum Dashboard. */
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const current = await requireUser();
  if (!roles.includes(current.profile.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return current;
}

/** Variante für Server Actions und Route Handler: wirft statt umzuleiten. */
export async function assertRole(roles: Role[]): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) throw new AuthError("Nicht angemeldet.");
  if (!roles.includes(current.profile.role)) throw new AuthError("Dazu fehlt die Berechtigung.");
  return current;
}

export class AuthError extends Error {}
