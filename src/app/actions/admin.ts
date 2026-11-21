"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRole, AuthError } from "@/lib/auth";
import { dbErrorMessage, logServerError } from "@/lib/errors";
import {
  departmentSchema,
  firstError,
  formToObject,
  locationSchema,
  routeSchema,
  routeStopSchema,
  settingsSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/types";

function deny(e: unknown): ActionState {
  if (e instanceof AuthError) return { ok: false, message: e.message };
  logServerError("admin action", e);
  return { ok: false, message: "Die Aktion konnte nicht ausgeführt werden." };
}

// ---------------------------------------------------------------------
// Benutzerverwaltung (Service-Role, nur nach Administratorprüfung)
// ---------------------------------------------------------------------
export async function createUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator"]);
    const parsed = userCreateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      user_metadata: { full_name: v.fullName },
    });
    if (error || !data.user) {
      logServerError("createUser", error);
      return { ok: false, message: "Benutzer konnte nicht angelegt werden (E-Mail evtl. bereits vergeben)." };
    }
    // Profil wurde per Trigger angelegt (Rolle mitarbeiter) -> jetzt Rolle/Abteilung setzen.
    const { error: pErr } = await admin
      .from("profiles")
      .update({ role: v.role, department_id: v.departmentId, full_name: v.fullName })
      .eq("id", data.user.id);
    if (pErr) {
      logServerError("createUser profile", pErr);
      return { ok: false, message: "Benutzer angelegt, aber Rolle konnte nicht gesetzt werden." };
    }
    await writeAudit(current.user.id, "user.create", "profile", data.user.id, {
      email: v.email,
      role: v.role,
    });
    revalidatePath("/admin/users");
    return { ok: true, message: `Benutzer ${v.email} angelegt.` };
  } catch (e) {
    return deny(e);
  }
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator"]);
    const parsed = userUpdateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;

    // Selbstschutz: Der letzte Administrator darf sich nicht selbst herabstufen/deaktivieren.
    if (v.profileId === current.user.id && (v.role !== "administrator" || !v.isActive)) {
      return {
        ok: false,
        message: "Sie können Ihre eigene Administratorrolle nicht entziehen oder sich deaktivieren.",
      };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({
        role: v.role,
        department_id: v.departmentId,
        is_active: v.isActive,
        full_name: v.fullName,
      })
      .eq("id", v.profileId);
    if (error) {
      logServerError("updateUser", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, "user.update", "profile", v.profileId, {
      role: v.role,
      is_active: v.isActive,
    });
    revalidatePath("/admin/users");
    return { ok: true, message: "Benutzer aktualisiert." };
  } catch (e) {
    return deny(e);
  }
}

// ---------------------------------------------------------------------
// Abteilungen / Standorte (RLS erlaubt Schreiben nur den passenden Rollen)
// ---------------------------------------------------------------------
export async function saveDepartmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator"]);
    const parsed = departmentSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;
    const supabase = await createClient();
    const row = { name: v.name, code: v.code, head_profile_id: v.headProfileId };
    const { error } = v.id
      ? await supabase.from("departments").update(row).eq("id", v.id)
      : await supabase.from("departments").insert(row);
    if (error) {
      logServerError("saveDepartment", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, v.id ? "department.update" : "department.create", "department", v.id, {
      name: v.name,
    });
    revalidatePath("/admin/departments");
    return { ok: true, message: "Abteilung gespeichert." };
  } catch (e) {
    return deny(e);
  }
}

export async function saveLocationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle"]);
    const parsed = locationSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;
    const supabase = await createClient();
    const row = {
      building: v.building,
      floor: v.floor,
      room: v.room,
      department_id: v.departmentId,
    };
    const { error } = v.id
      ? await supabase.from("locations").update(row).eq("id", v.id)
      : await supabase.from("locations").insert(row);
    if (error) {
      logServerError("saveLocation", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, v.id ? "location.update" : "location.create", "location", v.id, row);
    revalidatePath("/admin/locations");
    return { ok: true, message: "Standort gespeichert." };
  } catch (e) {
    return deny(e);
  }
}

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator"]);
    const parsed = settingsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.from("app_settings").upsert(
      [
        { key: "organization_name", value: v.organizationName, updated_by: current.user.id, updated_at: new Date().toISOString() },
        { key: "pickup_code_ttl_hours", value: v.pickupCodeTtlHours, updated_by: current.user.id, updated_at: new Date().toISOString() },
      ],
      { onConflict: "key" }
    );
    if (error) {
      logServerError("saveSettings", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, "settings.update", "app_settings", null, {
      organization_name: v.organizationName,
      pickup_code_ttl_hours: v.pickupCodeTtlHours,
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "Einstellungen gespeichert." };
  } catch (e) {
    return deny(e);
  }
}

// ---------------------------------------------------------------------
// Zustellrouten
// ---------------------------------------------------------------------
export async function createRouteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle"]);
    const parsed = routeSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("delivery_routes")
      .insert({
        name: v.name,
        courier_id: v.courierId,
        route_date: v.routeDate,
        created_by: current.user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      logServerError("createRoute", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, "route.create", "route", data.id as string, { name: v.name });
    revalidatePath("/routes");
    return { ok: true, message: "Route angelegt." };
  } catch (e) {
    return deny(e);
  }
}

export async function addRouteStopAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle"]);
    const parsed = routeStopSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const v = parsed.data;
    const supabase = await createClient();

    const { data: shipment } = await supabase
      .from("shipments")
      .select("id,location_id")
      .eq("id", v.shipmentId)
      .maybeSingle();
    if (!shipment) return { ok: false, message: "Sendung nicht gefunden." };

    const { data: last } = await supabase
      .from("delivery_route_stops")
      .select("stop_order")
      .eq("route_id", v.routeId)
      .order("stop_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((last?.stop_order as number | undefined) ?? 0) + 1;

    const { error } = await supabase.from("delivery_route_stops").insert({
      route_id: v.routeId,
      shipment_id: v.shipmentId,
      location_id: shipment.location_id,
      stop_order: nextOrder,
    });
    if (error) {
      logServerError("addRouteStop", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, "route.stop_add", "route", v.routeId, { shipment_id: v.shipmentId });
    revalidatePath("/routes");
    return { ok: true, message: "Stopp hinzugefügt." };
  } catch (e) {
    return deny(e);
  }
}

export async function moveRouteStopAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle"]);
    const stopId = String(formData.get("stopId") ?? "");
    const direction = String(formData.get("direction") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(stopId) || !["up", "down"].includes(direction)) {
      return { ok: false, message: "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    const { data: stop } = await supabase
      .from("delivery_route_stops")
      .select("id,route_id,stop_order")
      .eq("id", stopId)
      .maybeSingle();
    if (!stop) return { ok: false, message: "Stopp nicht gefunden." };

    const targetOrder = (stop.stop_order as number) + (direction === "up" ? -1 : 1);
    const { data: other } = await supabase
      .from("delivery_route_stops")
      .select("id,stop_order")
      .eq("route_id", stop.route_id)
      .eq("stop_order", targetOrder)
      .maybeSingle();
    if (!other) return { ok: true, message: "Keine Änderung." };

    // Beide Reihenfolgen tauschen. Die Unique-Constraint ist "deferrable initially deferred";
    // da PostgREST jede Anfrage einzeln ausführt, wird über einen temporären Wert getauscht.
    const tmp = 100000 + Math.floor(Math.random() * 100000);
    const r1 = await supabase
      .from("delivery_route_stops")
      .update({ stop_order: tmp })
      .eq("id", stop.id);
    if (r1.error) return { ok: false, message: dbErrorMessage(r1.error) };
    const r2 = await supabase
      .from("delivery_route_stops")
      .update({ stop_order: stop.stop_order })
      .eq("id", other.id);
    if (r2.error) return { ok: false, message: dbErrorMessage(r2.error) };
    const r3 = await supabase
      .from("delivery_route_stops")
      .update({ stop_order: targetOrder })
      .eq("id", stop.id);
    if (r3.error) return { ok: false, message: dbErrorMessage(r3.error) };

    await writeAudit(current.user.id, "route.stop_move", "route", stop.route_id as string, { stop_id: stopId, direction });
    revalidatePath("/routes");
    return { ok: true, message: "Reihenfolge geändert." };
  } catch (e) {
    return deny(e);
  }
}

export async function removeRouteStopAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle"]);
    const stopId = String(formData.get("stopId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(stopId)) return { ok: false, message: "Ungültiger Stopp." };
    const supabase = await createClient();
    const { error } = await supabase.from("delivery_route_stops").delete().eq("id", stopId);
    if (error) {
      logServerError("removeRouteStop", error);
      return { ok: false, message: dbErrorMessage(error) };
    }
    await writeAudit(current.user.id, "route.stop_remove", "route_stop", stopId);
    revalidatePath("/routes");
    return { ok: true, message: "Stopp entfernt." };
  } catch (e) {
    return deny(e);
  }
}

export async function setRouteStatusAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const current = await assertRole(["administrator", "poststelle", "zusteller"]);
    const routeId = String(formData.get("routeId") ?? "");
    const status = String(formData.get("status") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(routeId) || !["geplant", "aktiv", "abgeschlossen"].includes(status)) {
      return { ok: false, message: "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    // Zusteller dürfen den Status ihrer eigenen Route nicht über RLS ändern (nur Poststelle);
    // daher läuft der Wechsel für Zusteller über Service-Role nach Besitzprüfung.
    if (current.profile.role === "zusteller") {
      const { data: own } = await supabase
        .from("delivery_routes")
        .select("id")
        .eq("id", routeId)
        .eq("courier_id", current.user.id)
        .maybeSingle();
      if (!own) return { ok: false, message: "Route nicht gefunden." };
      const admin = createAdminClient();
      const { error } = await admin.from("delivery_routes").update({ status }).eq("id", routeId);
      if (error) {
        logServerError("setRouteStatus", error);
        return { ok: false, message: "Status konnte nicht geändert werden." };
      }
    } else {
      const { error } = await supabase.from("delivery_routes").update({ status }).eq("id", routeId);
      if (error) {
        logServerError("setRouteStatus", error);
        return { ok: false, message: dbErrorMessage(error) };
      }
    }
    await writeAudit(current.user.id, "route.status", "route", routeId, { status });
    revalidatePath("/routes");
    revalidatePath("/courier");
    return { ok: true, message: "Routenstatus aktualisiert." };
  } catch (e) {
    return deny(e);
  }
}
