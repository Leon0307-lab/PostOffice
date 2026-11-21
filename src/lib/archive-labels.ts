import type { DocumentKind } from "@/types";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  empfangsbestaetigung: "Empfangsbestätigung",
  unterschrift: "Unterschrift",
  foto: "Foto",
  etikett: "Versandetikett",
  sonstiges: "Weiteres Dokument",
};
