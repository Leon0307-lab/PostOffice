import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ShipmentPriority, ShipmentStatus } from "@/types";

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  erstellt: "bg-gray-100 text-gray-700",
  eingegangen: "bg-info-soft text-info",
  zugewiesen: "bg-info-soft text-info",
  uebernommen: "bg-info-soft text-info",
  im_transport: "bg-info-soft text-info",
  in_zustellung: "bg-yellow-100 text-yellow-800",
  abholbereit: "bg-yellow-100 text-yellow-800",
  zugestellt: "bg-ok-soft text-ok",
  nicht_zustellbar: "bg-bad-soft text-bad",
  rueckgabe_eingeleitet: "bg-orange-100 text-orange-800",
  zurueckgesendet: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`badge ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

const PRIORITY_STYLES: Record<ShipmentPriority, string> = {
  niedrig: "bg-gray-100 text-gray-600",
  normal: "bg-gray-100 text-gray-700",
  hoch: "bg-orange-100 text-orange-800",
  dringend: "bg-bad-soft text-bad",
};

export function PriorityBadge({ priority }: { priority: ShipmentPriority }) {
  return <span className={`badge ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function ConfidentialBadge() {
  return <span className="badge bg-brand-anthracite text-brand-yellow">Vertraulich</span>;
}
