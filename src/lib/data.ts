import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Department,
  DirectoryEntry,
  Location,
  Shipment,
} from "@/types";

/** Alle Abteilungen (für alle angemeldeten Benutzer lesbar). */
export const getDepartments = cache(async (): Promise<Department[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id,name,code,head_profile_id")
    .order("name");
  return (data ?? []) as Department[];
});

export const getLocations = cache(async (): Promise<Location[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id,building,floor,room,department_id")
    .order("building")
    .order("floor")
    .order("room");
  return (data ?? []) as Location[];
});

/** Namensverzeichnis aktiver Benutzer (nur id, Name, Rolle, Abteilung). */
export const getDirectory = cache(async (): Promise<DirectoryEntry[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("directory")
    .select("id,full_name,role,department_id")
    .order("full_name");
  return (data ?? []) as DirectoryEntry[];
});

export function nameMap(entries: DirectoryEntry[]): Map<string, string> {
  return new Map(entries.map((e) => [e.id, e.full_name || "(ohne Name)"]));
}

export function locationLabel(loc: Location | undefined | null): string {
  if (!loc) return "";
  return [loc.building, loc.floor && `Etage ${loc.floor}`, loc.room && `Raum ${loc.room}`]
    .filter(Boolean)
    .join(", ");
}

export const SHIPMENT_COLUMNS =
  "id,shipment_number,sender_name,sender_profile_id,recipient_id,recipient_name,recipient_department_id,location_id,shipment_type,shipping_method,direction,priority,subject,description,status,confidential,created_by,assigned_courier_id,return_reason,return_comment,delivered_at,archived_at,created_at,updated_at";

export async function getShipmentById(id: string): Promise<Shipment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as Shipment | null) ?? null;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data && data.value !== null && data.value !== undefined ? (data.value as T) : fallback;
}
