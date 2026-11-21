# PostOffice

Internes Post- und Logistikmanagementsystem für eine Organisation mit mehreren Abteilungen in einem Gebäude.
Erfassung, Zuweisung, Zustellung mit digitaler Unterschrift, PDF-Empfangsbestätigung, Etikettendruck,
Abholcodes, Fotodokumentation, Rücksendungen, interne Routen, Archiv und Statistiken.

**Technik:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage, Row Level Security) · Vercel · PWA

---

## 0. Ehrlicher Prüfstatus (bitte zuerst lesen)

Das Projekt wurde in einer Umgebung **ohne Netzwerkzugriff für Paketinstallationen** erstellt.

| Prüfung | Status |
|---|---|
| `npm install` | **Nicht ausgeführt** |
| `npm run lint` | **Nicht ausgeführt** |
| `npm run build` | **Nicht ausgeführt** |
| `npm test` (Vitest) | **Nicht ausgeführt** (Vitest nicht installierbar) |
| SQL-Migrationen gegen echte Supabase-Instanz | **Nicht ausgeführt** |
| `tests/db/rls_and_workflow.sql` | **Nicht ausgeführt** |
| Kamera-Scanner, Unterschriftenfeld, PWA-Installation auf iPad | **Nicht getestet** |
| Reine Logik (Statusübergänge, Sendungsnummer-Parsing, Abholcode-Erzeugung/Hash, Rechteprüfung, PDF-Textbereinigung) | Per Skript geprüft: **bestanden** |
| Statische Konsistenz (alle `@/`-Imports vorhanden, alle RPC-Aufrufe im SQL definiert und freigegeben, alle Tabellen im Code im Schema vorhanden) | **bestanden** |

Das heißt: Der Code ist vollständig geschrieben, aber **noch nie kompiliert**. Rechnen Sie beim ersten `npm run build`
mit einzelnen TypeScript- oder Lint-Fehlern (typisch bei ~100 neu geschriebenen Dateien). Führen Sie in Codespaces
die Schritte aus Abschnitt 9 („Erste Inbetriebnahme prüfen") in genau dieser Reihenfolge aus und beheben Sie die Meldungen.

---

## 1. GitHub-Projekt einrichten

1. Auf github.com ein **privates** Repository `postoffice` anlegen (ohne README/.gitignore).
2. Das ZIP entpacken und den Inhalt des Ordners `PostOffice/` in das Repository hochladen
   (Browser: *Add file → Upload files*, oder per Git:
   ```bash
   cd PostOffice
   git init && git add . && git commit -m "PostOffice: Erstversion"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/postoffice.git
   git push -u origin main
   ```
3. `.env.local` darf **nie** committen werden (steht in `.gitignore`).

## 2. Codespaces starten

1. Im Repository: **Code → Codespaces → Create codespace on main**.
2. Es öffnet sich VS Code im Browser (auch auf dem iPad bedienbar).
3. Terminal öffnen (`Strg+Ö` bzw. Menü *Terminal → New Terminal*).

## 3. Pakete installieren

```bash
npm install
```

Benötigt: Node.js ≥ 20.9 (in Codespaces vorhanden). Verwendete Laufzeitpakete:
`next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `pdf-lib`, `bwip-js` (Barcode/QR),
`pngjs` (Unterschriftenprüfung), `html5-qrcode` (Kamera-Scanner), `server-only`.
Dev: `typescript`, `tailwindcss@3`, `eslint`, `eslint-config-next`, `vitest`.

Falls `npm install` Versionskonflikte meldet, die in `package.json` angegebenen Bereiche (`^`) anpassen.

## 4. Supabase einrichten

1. Auf supabase.com ein Projekt anlegen (Region: EU/Frankfurt empfohlen, Datenschutz).
2. **Project Settings → API**: `Project URL`, `anon public` Key und `service_role` Key notieren.
3. **Authentication → Providers → Email**: aktiv lassen. Empfehlung: *Allow new users to sign up* **deaktivieren**
   (Konten legt nur der Administrator an). Unter *Password Security* ein starkes Mindestmaß einstellen.

## 5. SQL-Migrationen ausführen

Im Supabase-Dashboard **SQL Editor → New query**, den Inhalt der Dateien **in dieser Reihenfolge** einfügen und ausführen:

1. `supabase/migrations/20260101000001_schema.sql` – Tabellen, Typen, Indizes, Trigger
2. `supabase/migrations/20260101000002_functions.sql` – Geschäftsprozesse (Zustellung, Abholcodes, Statistik)
3. `supabase/migrations/20260101000003_rls.sql` – Row Level Security, Rechte, private Storage-Buckets

(Alternativ mit der Supabase CLI: `supabase link` und `supabase db push`.)

Danach **empfohlen**: `tests/db/rls_and_workflow.sql` im SQL Editor ausführen. Es legt Testdaten an, prüft u. a.
Sichtbarkeit vertraulicher Sendungen, Zustellung nur mit Unterschrift, Einmaligkeit von Abholcodes und
Unveränderlichkeit des Verlaufs, und **rollt alles zurück**. Erwartet wird die Meldung `ALLE DB-TESTS BESTANDEN`.

Prüfen unter **Storage**: Es müssen die Buckets `signatures`, `receipts`, `labels`, `photos`, `documents` existieren,
alle als **privat**.

## 6. Ersten Administrator anlegen

1. Supabase: **Authentication → Users → Add user → Create new user**, E-Mail + Passwort, *Auto Confirm User* anhaken.
2. Das Profil wird automatisch mit der Rolle `mitarbeiter` angelegt. Im SQL Editor zum Administrator machen:
   ```sql
   update public.profiles
      set role = 'administrator', full_name = 'Vorname Nachname'
    where email = 'deine-adresse@beispiel.de';
   ```
3. In der App anmelden. Weitere Benutzer legt der Administrator unter **Benutzer** an (Rollen, Abteilungen, Aktiv-Status).
4. Danach unter **Abteilungen**, **Standorte** (Gebäude/Etage/Raum) und **Einstellungen** (Organisationsname) pflegen.

Neue Konten erhalten *immer* die Rolle `mitarbeiter`; Rollen vergibt nur ein Administrator.

## 7. Umgebungsvariablen

Vorlage: `.env.example` → nach `.env.local` kopieren (lokal/Codespaces) bzw. in Vercel eintragen.

| Variable | Zweck | Öffentlich? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-Projekt-URL | ja |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon-Key (durch RLS begrenzt) | ja |
| `SUPABASE_SERVICE_ROLE_KEY` | Voller Zugriff, nur Server (Datei-Storage, Benutzerverwaltung, Audit) | **NEIN** |
| `PICKUP_CODE_PEPPER` | Geheimer Wert (≥ 32 Zeichen) für den HMAC der Abholcodes; `openssl rand -base64 48` | **NEIN** |
| `NEXT_PUBLIC_APP_URL` | Basis-URL der App | ja |

Der Service-Role-Key hat bewusst **kein** `NEXT_PUBLIC_`-Präfix und ist per `server-only` vom Browser-Bundle ausgeschlossen.
Wird `PICKUP_CODE_PEPPER` nach der Einführung geändert, werden bereits ausgegebene, noch ungenutzte Abholcodes ungültig.

## 8. Vercel verbinden und veröffentlichen

1. vercel.com → **Add New → Project** → das GitHub-Repository importieren (Framework: Next.js wird erkannt).
2. Unter **Environment Variables** alle Variablen aus Abschnitt 7 eintragen (für *Production* und *Preview*).
3. **Deploy**. Jeder Push auf `main` veröffentlicht automatisch neu.
4. Die Vercel-URL (HTTPS) bei `NEXT_PUBLIC_APP_URL` eintragen und neu deployen.
5. In Supabase unter **Authentication → URL Configuration** die Vercel-URL als *Site URL* eintragen.

HTTPS ist über Vercel automatisch aktiv – **Voraussetzung für Kamerazugriff und PWA**.

## 9. Erste Inbetriebnahme prüfen (in Codespaces)

```bash
npm install
npm run lint        # Meldungen beheben
npm run typecheck   # TypeScript-Fehler beheben
npm run build       # muss ohne Fehler durchlaufen
npm test            # Vitest
npm run dev         # lokal starten: http://localhost:3000
```

Manuelle Abnahme (Checkliste):
- [ ] Anmeldung als Administrator; Benutzer „Poststelle“, „Zusteller“, „Mitarbeiter“ anlegen
- [ ] Als Poststelle: eingehende Sendung erfassen → Nummer `PO-JJJJ-000001`, Verlauf zeigt „erstellt“ + „eingegangen“
- [ ] Zusteller zuweisen → Zusteller sieht sie unter „Meine Zustellungen“, fremder Zusteller nicht
- [ ] Zusteller: Übernehmen → Zustellung starten → Unterschrift (leer absenden muss scheitern) → zugestellt
- [ ] Empfangsbestätigung-PDF öffnet sich, enthält Barcode, QR, Unterschrift
- [ ] Etiketten-PDF (8 pro Seite und Einzeletikett) öffnet und druckt auf A4
- [ ] Vertrauliche Sendung: nicht für Abteilungsverantwortliche/fremde Mitarbeiter sichtbar
- [ ] Abholbereit → Abholcode erzeugen (wird nur einmal angezeigt) → Poststelle gibt gegen Code aus; zweite Nutzung scheitert
- [ ] Scanner auf iPad/Smartphone über HTTPS: Kamera-Freigabe, Code scannen, manuelle Eingabe, unbekannter Code
- [ ] Mitarbeiter ruft Datei-URL einer fremden Sendung auf → 404

## 10. PWA auf dem iPad installieren

1. Die HTTPS-Adresse der App in **Safari** öffnen und anmelden.
2. **Teilen-Symbol** (Quadrat mit Pfeil) antippen.
3. **„Zum Home-Bildschirm“** wählen, Namen „PostOffice“ bestätigen, **Hinzufügen**.
4. Die App startet nun im Vollbild über das Icon. Android/Chrome: Menü → „App installieren“.

Der Service Worker speichert bewusst **keine Sendungsdaten** offline (Datenschutz, keine ungeklärte Synchronisation).
Ohne Verbindung erscheint eine Hinweisseite.

---

## Rollen im Überblick

| Rolle | Kernrechte |
|---|---|
| Administrator | alles inkl. Benutzer, Abteilungen, Einstellungen, Audit-Protokoll, Statistiken |
| Poststellenmitarbeiter | Sendungen erfassen/bearbeiten, Zusteller zuweisen, Etiketten, Archiv, Rücksendungen, Routen |
| Zusteller | nur zugewiesene Sendungen: scannen, übernehmen, zustellen, Unterschrift, Fotos, Problem melden |
| Mitarbeiter | eigene (als Empfänger/Absender/Ersteller) Sendungen, Status, Abholcode |
| Abteilungsverantwortlicher | **nicht vertrauliche** Sendungen der eigenen Abteilung, Statistiken |

## Sicherheitskonzept

- **Row Level Security auf allen Tabellen.** Sichtbarkeit zentral in `po_can_view_shipment()`; vertrauliche Sendungen sind
  für Abteilungsmitglieder **nicht** automatisch sichtbar, nur für Empfänger, Absender, Ersteller, Poststelle/Admin und
  ausdrücklich freigegebene Personen (`shipment_access_grants`, optional mit Ablauf).
- **Keine Schreibrechte für Clients auf Sendungsdaten.** Statuswechsel, Zuweisung, Zustellung, Abholcodes, Freigaben und
  Archivierung laufen ausschließlich über `SECURITY DEFINER`-Funktionen mit eigener Rollenprüfung. Ein Datenbank-Trigger
  blockiert zusätzlich jede direkte Änderung von Status, Zusteller, Rücksendegrund und Sendungsnummer.
- **Zustellung nur mit Unterschrift – atomar.** `po_deliver_shipment` sperrt die Sendung (`FOR UPDATE`), speichert Unterschrift und
  setzt den Status in *einer* Transaktion. Ein zweiter Trigger verweigert `zugestellt` ohne Eintrag in `signatures`.
  Die PNG-Unterschrift wird serverseitig auf Format, Größe und tatsächlich vorhandene Tinte geprüft.
- **Unveränderlich:** `shipment_events`, `signatures`, `audit_logs` (Trigger verbieten UPDATE/DELETE für alle Rollen).
- **Abholcodes:** kryptografisch zufällig (8 Zeichen ohne verwechselbare Zeichen), in der Datenbank nur als HMAC-SHA256-Hash,
  Ablaufdatum, einmalig einlösbar, Einlösung und Fehlversuche im Audit-Log. Spalte `code_hash` ist für Clients nicht lesbar.
- **Dateien:** ausschließlich private Buckets ohne Client-Policies. Auslieferung nur über Server-Routen
  (`/api/files/...`, `/api/receipt/...`), die zuerst per RLS prüfen, ob der Benutzer die Sendung sehen darf.
- **Keine Secrets im Frontend**, Security-Header (HSTS, `nosniff`, `X-Frame-Options`, `Permissions-Policy`),
  Eingabevalidierung mit Zod, Fehlermeldungen ohne interne Details.

## Bekannte Grenzen / ehrliche Hinweise

- **Nicht kompiliert und nicht getestet** (siehe Abschnitt 0).
- **Keine Push-Benachrichtigungen** – nur In-App-Benachrichtigungen (Anforderung: „können zusätzlich integriert werden“).
- **Offline-Betrieb** ist bewusst nicht umgesetzt.
- **Kein Rate-Limiting für Anmeldungen** in der App selbst; Supabase Auth bringt eigene Limits mit. Fehlgeschlagene Anmeldungen werden protokolliert.
- **Fotos und Dateiuploads** laufen über Next.js Server Actions (Limit 10 MB). Große Handyfotos werden bis 8 MB akzeptiert.
- **Benutzerliste** im Admin-Bereich wird nach Administratorprüfung mit dem Service-Role-Key gelesen (inkl. deaktivierter Konten).
- **Etikettenraster** ist 2×4 pro A4-Seite (105 × 74,25 mm), eine Position im Bogen ist beim Einzeletikett wählbar. Passen Sie `LABEL_COLUMNS`/`LABEL_ROWS` in `src/lib/pdf/labels.ts` an Ihr Etikettenpapier an.
- **Foto-Metadaten** (`documents` nur für PDFs/Dokumente; Fotos liegen in `shipment_photos`).
- Der Verlauf enthält bei Fotoupload und Archivierung Einträge, die über den Service-Role-Key geschrieben werden.

## Projektstruktur

```
PostOffice/
├── public/                  Manifest, Icons, Service Worker, Offline-Seite
├── src/
│   ├── app/
│   │   ├── (app)/           geschützte Seiten (Dashboard, Sendungen, Zusteller, Scan, Routen, Rücksendungen,
│   │   │                    Archiv, Statistiken, Benachrichtigungen, Admin)
│   │   ├── actions/         Server Actions (Auth, Sendungen, Zustellung, Scan, Admin, Benachrichtigungen)
│   │   ├── api/             Datei-/PDF-Routen (Etiketten, Dokumente, Fotos, Empfangsbestätigung)
│   │   └── login/
│   ├── components/          UI, Scanner, Unterschriftenfeld, Formulare
│   ├── lib/                 Auth, Rechte, Validierung, Signatur- und Abholcode-Logik, PDF, Storage, Supabase-Clients
│   ├── middleware.ts        Session-Erneuerung und Zugriffsschutz
│   └── types/
├── supabase/migrations/     Schema, Funktionen, RLS + Storage
├── tests/                   Vitest-Tests und SQL-Datenbanktests
├── .env.example
└── README.md
```
