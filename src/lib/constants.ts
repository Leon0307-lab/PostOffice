import type {
  PhotoCategory,
  ReturnReason,
  Role,
  ShipmentDirection,
  ShipmentPriority,
  ShipmentStatus,
  ShipmentType,
  ShippingMethod,
} from "@/types";

export const ROLES: Role[] = [
  "administrator",
  "poststelle",
  "zusteller",
  "mitarbeiter",
  "abteilungsleiter",
];

export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  poststelle: "Poststellenmitarbeiter",
  zusteller: "Zusteller",
  mitarbeiter: "Mitarbeiter",
  abteilungsleiter: "Abteilungsverantwortlicher",
};

export const SHIPMENT_TYPES: ShipmentType[] = ["brief", "paket", "dokument", "sonstiges"];
export const TYPE_LABELS: Record<ShipmentType, string> = {
  brief: "Brief",
  paket: "Paket",
  dokument: "Dokument",
  sonstiges: "Sonstiges",
};

export const SHIPPING_METHODS: ShippingMethod[] = [
  "hauspost",
  "post",
  "paketdienst",
  "kurier",
  "persoenlich",
];
export const METHOD_LABELS: Record<ShippingMethod, string> = {
  hauspost: "Hauspost",
  post: "Post",
  paketdienst: "Paketdienst",
  kurier: "Kurier",
  persoenlich: "Persönliche Übergabe",
};

export const DIRECTIONS: ShipmentDirection[] = ["eingehend", "ausgehend", "intern"];
export const DIRECTION_LABELS: Record<ShipmentDirection, string> = {
  eingehend: "Eingehend",
  ausgehend: "Ausgehend",
  intern: "Intern",
};

export const PRIORITIES: ShipmentPriority[] = ["niedrig", "normal", "hoch", "dringend"];
export const PRIORITY_LABELS: Record<ShipmentPriority, string> = {
  niedrig: "Niedrig",
  normal: "Normal",
  hoch: "Hoch",
  dringend: "Dringend",
};

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  erstellt: "Erstellt",
  eingegangen: "Bei der Poststelle eingegangen",
  zugewiesen: "Zusteller zugewiesen",
  uebernommen: "Übernommen",
  im_transport: "Im Transport",
  in_zustellung: "In Zustellung",
  abholbereit: "Zur Abholung bereit",
  zugestellt: "Zugestellt",
  nicht_zustellbar: "Nicht zustellbar",
  rueckgabe_eingeleitet: "Rücksendung eingeleitet",
  zurueckgesendet: "Zurückgesendet",
};

export const STATUS_ORDER: ShipmentStatus[] = [
  "erstellt",
  "eingegangen",
  "zugewiesen",
  "uebernommen",
  "im_transport",
  "in_zustellung",
  "abholbereit",
  "zugestellt",
  "nicht_zustellbar",
  "rueckgabe_eingeleitet",
  "zurueckgesendet",
];

export const RETURN_REASONS: ReturnReason[] = [
  "empfaenger_unbekannt",
  "nicht_angetroffen",
  "annahme_verweigert",
  "beschaedigt",
  "falsche_abteilung",
  "sonstiges",
];
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  empfaenger_unbekannt: "Empfänger unbekannt",
  nicht_angetroffen: "Empfänger nicht angetroffen",
  annahme_verweigert: "Annahme verweigert",
  beschaedigt: "Sendung beschädigt",
  falsche_abteilung: "Falsche Abteilung",
  sonstiges: "Sonstiger Grund",
};

export const PHOTO_CATEGORIES: PhotoCategory[] = [
  "beschaedigung",
  "ablageort",
  "zustellproblem",
  "ruecksendung",
  "sonstiges",
];
export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  beschaedigung: "Beschädigung",
  ablageort: "Ablageort",
  zustellproblem: "Zustellproblem",
  ruecksendung: "Rücksendung",
  sonstiges: "Sonstiges",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  erstellt: "Sendung erstellt",
  status: "Statuswechsel",
  zuweisung: "Zustellerzuweisung",
  notiz: "Notiz",
  foto: "Foto",
  abholcode: "Abholcode",
  freigabe: "Freigabe",
  archiviert: "Archiviert",
  empfangsbestaetigung: "Empfangsbestätigung",
};

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 512 * 1024;
