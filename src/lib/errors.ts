interface DbErrorLike {
  message?: string;
  code?: string;
}

/**
 * Wandelt Datenbankfehler in verständliche deutsche Meldungen um.
 * Meldungen unserer eigenen Geschäftsfunktionen (errcode P0001/42501/P0002 und deutsche Texte)
 * werden durchgereicht; unerwartete technische Fehler werden verborgen.
 */
export function dbErrorMessage(error: DbErrorLike | null | undefined): string {
  if (!error) return "Unbekannter Fehler.";
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "42501" && !/[äöüß]|Keine Berechtigung|Zusteller|Poststelle/.test(message)) {
    return "Dazu fehlt die Berechtigung.";
  }
  if (code === "P0001" || code === "P0002" || code === "42501" || code === "28000") {
    return message || "Aktion nicht möglich.";
  }
  if (code === "23505") return "Dieser Eintrag existiert bereits.";
  if (code === "23503") return "Der Eintrag wird noch verwendet oder verweist auf etwas Unbekanntes.";
  if (code === "23514") return "Ein eingegebener Wert ist ungültig.";
  if (code === "PGRST116") return "Eintrag nicht gefunden.";
  // Eigene, auf Deutsch formulierte Fehler (RAISE EXCEPTION) erkennen.
  if (/^(Sendung|Statuswechsel|Zustellung|Abholcode|Keine|Nur|Bitte|Empf|Betreff|Notiz|Gültige|Der |Zuweisung|Ungültig)/.test(message)) {
    return message;
  }
  return "Die Aktion konnte nicht ausgeführt werden. Bitte später erneut versuchen.";
}

/** Fehler nur serverseitig protokollieren (ohne sensible Inhalte). */
export function logServerError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  console.error(`[PostOffice] ${context}: ${msg}`);
}
