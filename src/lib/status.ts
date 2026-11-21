import type { ShipmentStatus } from "@/types";

/**
 * Spiegel der Tabelle public.status_transitions (Quelle der Wahrheit ist die Datenbank).
 * Wird für die Oberfläche (Buttons) und Tests verwendet. Die Datenbank erzwingt die Regeln
 * unabhängig davon.
 */
export const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  erstellt: ["eingegangen"],
  eingegangen: ["zugewiesen", "abholbereit"],
  zugewiesen: ["zugewiesen", "uebernommen"],
  uebernommen: ["im_transport", "in_zustellung", "nicht_zustellbar"],
  im_transport: ["in_zustellung", "nicht_zustellbar"],
  in_zustellung: ["zugestellt", "nicht_zustellbar", "abholbereit"],
  abholbereit: ["zugestellt", "rueckgabe_eingeleitet"],
  zugestellt: [],
  nicht_zustellbar: ["eingegangen", "zugewiesen", "abholbereit", "rueckgabe_eingeleitet"],
  rueckgabe_eingeleitet: ["zurueckgesendet"],
  zurueckgesendet: [],
};

export const FINAL_STATUSES: ShipmentStatus[] = ["zugestellt", "zurueckgesendet"];

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Status, die NICHT über den allgemeinen Statuswechsel gesetzt werden dürfen. */
export const SPECIAL_PROCESS_STATUSES: ShipmentStatus[] = ["zugestellt", "zugewiesen"];

export function isFinal(status: ShipmentStatus): boolean {
  return FINAL_STATUSES.includes(status);
}
