"use client";

import { useEffect } from "react";

/** Registriert den (minimalen, datenfreien) Service Worker für die PWA-Installation. */
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation ist optional; Fehler sind für den Betrieb unkritisch.
    });
  }, []);
  return null;
}
