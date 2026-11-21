export type Role =
  | "administrator"
  | "poststelle"
  | "zusteller"
  | "mitarbeiter"
  | "abteilungsleiter";

export type ShipmentType = "brief" | "paket" | "dokument" | "sonstiges";
export type ShippingMethod = "hauspost" | "post" | "paketdienst" | "kurier" | "persoenlich";
export type ShipmentDirection = "eingehend" | "ausgehend" | "intern";
export type ShipmentPriority = "niedrig" | "normal" | "hoch" | "dringend";

export type ShipmentStatus =
  | "erstellt"
  | "eingegangen"
  | "zugewiesen"
  | "uebernommen"
  | "im_transport"
  | "in_zustellung"
  | "abholbereit"
  | "zugestellt"
  | "nicht_zustellbar"
  | "rueckgabe_eingeleitet"
  | "zurueckgesendet";

export type ReturnReason =
  | "empfaenger_unbekannt"
  | "nicht_angetroffen"
  | "annahme_verweigert"
  | "beschaedigt"
  | "falsche_abteilung"
  | "sonstiges";

export type PhotoCategory =
  | "beschaedigung"
  | "ablageort"
  | "zustellproblem"
  | "ruecksendung"
  | "sonstiges";

export type DocumentKind =
  | "empfangsbestaetigung"
  | "unterschrift"
  | "foto"
  | "etikett"
  | "sonstiges";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  location_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  head_profile_id: string | null;
}

export interface Location {
  id: string;
  building: string;
  floor: string;
  room: string;
  department_id: string | null;
}

export interface Shipment {
  id: string;
  shipment_number: string;
  sender_name: string;
  sender_profile_id: string | null;
  recipient_id: string | null;
  recipient_name: string;
  recipient_department_id: string | null;
  location_id: string | null;
  shipment_type: ShipmentType;
  shipping_method: ShippingMethod;
  direction: ShipmentDirection;
  priority: ShipmentPriority;
  subject: string;
  description: string;
  status: ShipmentStatus;
  confidential: boolean;
  created_by: string;
  assigned_courier_id: string | null;
  return_reason: ReturnReason | null;
  return_comment: string | null;
  delivered_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentEvent {
  id: number;
  shipment_id: string;
  event_type: string;
  from_status: ShipmentStatus | null;
  to_status: ShipmentStatus | null;
  comment: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DirectoryEntry {
  id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  shipment_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  shipment_id: string;
  kind: DocumentKind;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface PhotoRow {
  id: string;
  shipment_id: string;
  storage_path: string;
  category: PhotoCategory;
  note: string | null;
  mime_type: string;
  created_at: string;
}

export interface SignatureRow {
  id: string;
  shipment_id: string;
  recipient_name: string;
  storage_path: string;
  sha256: string;
  captured_by: string;
  captured_at: string;
}

export interface ActionState {
  ok: boolean;
  message?: string;
  /** Einmalig anzuzeigender Klartext (z. B. Abholcode). Wird nie gespeichert. */
  secret?: string;
}
