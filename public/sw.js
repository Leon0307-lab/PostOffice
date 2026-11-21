/*
 * PostOffice Service Worker
 *
 * Bewusst minimal: Es werden KEINE Sendungsdaten, Dokumente oder API-Antworten
 * lokal zwischengespeichert (Datenschutz, keine ungeklärte Offline-Synchronisation).
 * Gecacht werden nur die statische Offline-Seite und die App-Icons, damit die
 * App installierbar ist und bei fehlender Verbindung eine verständliche Meldung zeigt.
 */
const CACHE = "postoffice-static-v1";
const STATIC_ASSETS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
});
