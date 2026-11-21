-- =====================================================================
-- PostOffice - Datenbanktests (RLS, Geschäftsprozesse, Unveränderlichkeit)
--
-- AUSFÜHRUNG: Supabase Dashboard > SQL Editor, nachdem die Migrationen 1-3 gelaufen sind.
-- Das Skript legt Testdaten an und rollt am Ende ALLES zurück (keine Spuren).
-- Erfolg:  NOTICE "ALLE DB-TESTS BESTANDEN"
-- Fehler:  EXCEPTION mit Beschreibung des fehlgeschlagenen Tests.
--
-- HINWEIS: Diese Tests wurden bei der Erstellung NICHT gegen eine echte Supabase-Instanz
-- ausgeführt. Bitte einmal ausführen und Ergebnisse prüfen.
-- =====================================================================
begin;

do $test$
declare
  u_admin uuid := gen_random_uuid();
  u_post  uuid := gen_random_uuid();
  u_cour  uuid := gen_random_uuid();
  u_cour2 uuid := gen_random_uuid();
  u_emp   uuid := gen_random_uuid();   -- Empfänger
  u_other uuid := gen_random_uuid();   -- Fremder Mitarbeiter
  u_head  uuid := gen_random_uuid();   -- Abteilungsverantwortlicher
  d_it uuid;
  s_conf uuid; s_norm uuid;
  n int; ok boolean; v_num text; v_res jsonb;
  hash1 text := repeat('a', 64);
  hash2 text := repeat('b', 64);
  sigsha text := repeat('c', 64);
begin
  -- ------------------------------------------------------------------
  -- Testdaten (als Besitzerrolle)
  -- ------------------------------------------------------------------
  insert into public.departments (name, code) values ('Test-IT', 'TIT') returning id into d_it;

  insert into auth.users (id, email) values
    (u_admin, 'admin@test.local'), (u_post, 'post@test.local'), (u_cour, 'cour@test.local'),
    (u_cour2, 'cour2@test.local'), (u_emp, 'emp@test.local'), (u_other, 'other@test.local'),
    (u_head, 'head@test.local');

  -- Trigger legt Profile mit Rolle 'mitarbeiter' an
  select count(*) into n from public.profiles where id in (u_admin, u_post, u_cour, u_cour2, u_emp, u_other, u_head);
  if n <> 7 then raise exception 'TEST 0 fehlgeschlagen: Profile wurden nicht automatisch angelegt (%).', n; end if;
  if exists (select 1 from public.profiles where id = u_admin and role <> 'mitarbeiter') then
    raise exception 'TEST 0b fehlgeschlagen: neue Benutzer müssen Rolle mitarbeiter erhalten.';
  end if;

  update public.profiles set role = 'administrator', full_name = 'Admin' where id = u_admin;
  update public.profiles set role = 'poststelle', full_name = 'Post' where id = u_post;
  update public.profiles set role = 'zusteller', full_name = 'Zusteller Eins' where id = u_cour;
  update public.profiles set role = 'zusteller', full_name = 'Zusteller Zwei' where id = u_cour2;
  update public.profiles set full_name = 'Empfänger', department_id = d_it where id = u_emp;
  update public.profiles set full_name = 'Fremder' where id = u_other;
  update public.profiles set role = 'abteilungsleiter', full_name = 'Leiter', department_id = d_it where id = u_head;

  -- ------------------------------------------------------------------
  -- Poststelle erfasst zwei eingehende Sendungen (normal + vertraulich)
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_post, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_res := public.po_create_shipment('Extern GmbH', null, u_emp, null, d_it, null,
            'brief', 'post', 'eingehend', 'normal', 'Normale Sendung', '', false);
  s_norm := (v_res ->> 'id')::uuid;
  v_num := v_res ->> 'shipment_number';
  if v_num !~ '^PO-[0-9]{4}-[0-9]{6}$' then
    raise exception 'TEST 1 fehlgeschlagen: Sendungsnummer hat falsches Format: %', v_num;
  end if;

  v_res := public.po_create_shipment('Extern GmbH', null, u_emp, null, d_it, null,
            'dokument', 'post', 'eingehend', 'hoch', 'Vertrauliche Sendung', '', true);
  s_conf := (v_res ->> 'id')::uuid;
  if (v_res ->> 'shipment_number') = v_num then
    raise exception 'TEST 1b fehlgeschlagen: Sendungsnummern müssen eindeutig sein.';
  end if;

  -- Sendungsnummer ist unveränderlich
  begin
    update public.shipments set shipment_number = 'PO-2026-999999' where id = s_norm;
    raise exception 'TEST 2 fehlgeschlagen: Sendungsnummer konnte geändert werden.';
  exception when others then
    if sqlerrm like 'TEST 2%' then raise; end if;
  end;

  -- Direkter Statuswechsel ist verboten (nur über Geschäftsprozess)
  begin
    update public.shipments set status = 'zugestellt' where id = s_norm;
    raise exception 'TEST 3 fehlgeschlagen: direkter Statuswechsel auf zugestellt war möglich.';
  exception when others then
    if sqlerrm like 'TEST 3%' then raise; end if;
  end;

  -- Kein direktes INSERT in shipments (keine Grants)
  begin
    insert into public.shipments (shipment_number, sender_name, recipient_name, subject, created_by)
    values ('x', 'a', 'b', 'c', u_post);
    raise exception 'TEST 4 fehlgeschlagen: direktes INSERT in shipments war möglich.';
  exception when others then
    if sqlerrm like 'TEST 4%' then raise; end if;
  end;

  -- Zustellung über allgemeinen Statuswechsel ist verboten
  begin
    perform public.po_change_status(s_norm, 'zugestellt', null, null);
    raise exception 'TEST 5 fehlgeschlagen: po_change_status erlaubte zugestellt.';
  exception when others then
    if sqlerrm like 'TEST 5%' then raise; end if;
  end;

  -- Zustellung ohne Unterschrift (leerer Pfad) schlägt fehl
  begin
    perform public.po_deliver_shipment(s_norm, 'Empfänger', '', sigsha, null);
    raise exception 'TEST 6 fehlgeschlagen: Zustellung ohne Unterschrift war möglich.';
  exception when others then
    if sqlerrm like 'TEST 6%' then raise; end if;
  end;

  -- ------------------------------------------------------------------
  -- Sichtbarkeit (RLS)
  -- ------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.shipments where id in (s_norm, s_conf);
  if n <> 0 then raise exception 'TEST 7 fehlgeschlagen: fremder Mitarbeiter sieht % fremde Sendung(en).', n; end if;
  select count(*) into n from public.shipment_events where shipment_id in (s_norm, s_conf);
  if n <> 0 then raise exception 'TEST 7b fehlgeschlagen: fremder Mitarbeiter sieht Verlauf fremder Sendungen.'; end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'TEST 7c fehlgeschlagen: Nicht-Admin sieht Audit-Logs.'; end if;
  begin
    perform code_hash from public.pickup_codes;
    raise exception 'TEST 7d fehlgeschlagen: Spalte code_hash ist für Clients lesbar.';
  exception when others then
    if sqlerrm like 'TEST 7d%' then raise; end if;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_emp, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.shipments where id in (s_norm, s_conf);
  if n <> 2 then raise exception 'TEST 8 fehlgeschlagen: Empfänger sieht % statt 2 eigene Sendungen.', n; end if;

  -- Abteilungsverantwortlicher: sieht nicht vertrauliche, NICHT vertrauliche Abteilungssendungen nicht
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_head, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.shipments where id = s_norm;
  if n <> 1 then raise exception 'TEST 9 fehlgeschlagen: Abteilungsverantwortlicher sieht normale Abteilungssendung nicht.'; end if;
  select count(*) into n from public.shipments where id = s_conf;
  if n <> 0 then raise exception 'TEST 9b fehlgeschlagen: Abteilungsverantwortlicher sieht VERTRAULICHE Sendung.'; end if;

  -- ------------------------------------------------------------------
  -- Freigabe für vertrauliche Sendung
  -- ------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_post, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.po_grant_access(s_conf, u_head, null);

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_head, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.shipments where id = s_conf;
  if n <> 1 then raise exception 'TEST 10 fehlgeschlagen: ausdrückliche Freigabe wirkt nicht.'; end if;

  -- ------------------------------------------------------------------
  -- Zuweisung und Zustellung
  -- ------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_post, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.po_assign_shipment(s_norm, u_cour, 'Test');

  -- Zuweisung an Nicht-Zusteller scheitert
  begin
    perform public.po_assign_shipment(s_norm, u_emp, null);
    raise exception 'TEST 11 fehlgeschlagen: Zuweisung an Nicht-Zusteller möglich.';
  exception when others then
    if sqlerrm like 'TEST 11%' then raise; end if;
  end;

  -- falscher Zusteller sieht Sendung nicht und kann nicht übernehmen
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_cour2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.shipments where id = s_norm;
  if n <> 0 then raise exception 'TEST 12 fehlgeschlagen: fremder Zusteller sieht Sendung.'; end if;
  begin
    perform public.po_change_status(s_norm, 'uebernommen', null, null);
    raise exception 'TEST 12b fehlgeschlagen: fremder Zusteller konnte Sendung übernehmen.';
  exception when others then
    if sqlerrm like 'TEST 12b%' then raise; end if;
  end;

  -- richtiger Zusteller: Übernehmen -> in Zustellung
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_cour, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.po_change_status(s_norm, 'uebernommen', null, null);

  -- Zustellung aus "uebernommen" ist nicht erlaubt (muss erst in_zustellung sein)
  begin
    perform public.po_deliver_shipment(s_norm, 'Empfänger', 'x/y.png', sigsha, null);
    raise exception 'TEST 13 fehlgeschlagen: Zustellung im Status uebernommen möglich.';
  exception when others then
    if sqlerrm like 'TEST 13%' then raise; end if;
  end;

  perform public.po_change_status(s_norm, 'in_zustellung', null, null);

  -- Zustellung ohne Empfängername scheitert
  begin
    perform public.po_deliver_shipment(s_norm, ' ', 'x/y.png', sigsha, null);
    raise exception 'TEST 14 fehlgeschlagen: Zustellung ohne Empfängername möglich.';
  exception when others then
    if sqlerrm like 'TEST 14%' then raise; end if;
  end;

  -- Zustellung mit ungültigem Hash scheitert
  begin
    perform public.po_deliver_shipment(s_norm, 'Empfänger', 'x/y.png', 'kein-hash', null);
    raise exception 'TEST 14b fehlgeschlagen: Zustellung mit ungültiger Signatur-Prüfsumme möglich.';
  exception when others then
    if sqlerrm like 'TEST 14b%' then raise; end if;
  end;

  -- Erfolgreiche Zustellung
  perform public.po_deliver_shipment(s_norm, 'Empfänger', 'x/y.png', sigsha, null);

  execute 'reset role';
  if not exists (select 1 from public.shipments where id = s_norm and status = 'zugestellt' and delivered_at is not null) then
    raise exception 'TEST 15 fehlgeschlagen: Sendung ist nach Zustellung nicht zugestellt.';
  end if;
  if not exists (select 1 from public.signatures where shipment_id = s_norm) then
    raise exception 'TEST 15b fehlgeschlagen: Unterschrift wurde nicht gespeichert.';
  end if;

  -- Doppelte Zustellung scheitert
  perform set_config('request.jwt.claims', json_build_object('sub', u_cour, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.po_deliver_shipment(s_norm, 'Empfänger', 'x/z.png', sigsha, null);
    raise exception 'TEST 16 fehlgeschlagen: doppelte Zustellung möglich.';
  exception when others then
    if sqlerrm like 'TEST 16%' then raise; end if;
  end;
  execute 'reset role';

  -- Zugestellte Sendungen sind eingefroren
  perform set_config('request.jwt.claims', json_build_object('sub', u_post, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.shipments set subject = 'manipuliert' where id = s_norm;
    raise exception 'TEST 17 fehlgeschlagen: zugestellte Sendung war bearbeitbar.';
  exception when others then
    if sqlerrm like 'TEST 17%' then raise; end if;
  end;
  execute 'reset role';

  -- ------------------------------------------------------------------
  -- Unveränderlichkeit (gilt für ALLE Rollen inkl. Besitzer)
  -- ------------------------------------------------------------------
  begin
    update public.shipment_events set comment = 'manipuliert' where shipment_id = s_norm;
    raise exception 'TEST 18 fehlgeschlagen: Verlauf war änderbar.';
  exception when others then
    if sqlerrm like 'TEST 18%' then raise; end if;
  end;
  begin
    delete from public.shipment_events where shipment_id = s_norm;
    raise exception 'TEST 18b fehlgeschlagen: Verlauf war löschbar.';
  exception when others then
    if sqlerrm like 'TEST 18b%' then raise; end if;
  end;
  begin
    delete from public.signatures where shipment_id = s_norm;
    raise exception 'TEST 19 fehlgeschlagen: Unterschrift war löschbar.';
  exception when others then
    if sqlerrm like 'TEST 19%' then raise; end if;
  end;
  begin
    delete from public.audit_logs;
    raise exception 'TEST 19b fehlgeschlagen: Audit-Log war löschbar.';
  exception when others then
    if sqlerrm like 'TEST 19b%' then raise; end if;
  end;

  -- Verlauf enthält Statuswechsel mit Benutzer
  select count(*) into n from public.shipment_events where shipment_id = s_norm and actor_id is not null;
  if n < 5 then raise exception 'TEST 20 fehlgeschlagen: Verlauf unvollständig (% Einträge).', n; end if;

  -- ------------------------------------------------------------------
  -- Abholcodes
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_post, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.po_change_status(s_conf, 'abholbereit', null, null);

  -- Code für nicht abholbereite Sendung scheitert
  begin
    perform public.po_create_pickup_code(s_norm, hash1, now() + interval '1 day');
    raise exception 'TEST 21 fehlgeschlagen: Abholcode für zugestellte Sendung erzeugt.';
  exception when others then
    if sqlerrm like 'TEST 21%' then raise; end if;
  end;
  -- Ablauf in der Vergangenheit scheitert
  begin
    perform public.po_create_pickup_code(s_conf, hash1, now() - interval '1 hour');
    raise exception 'TEST 22 fehlgeschlagen: abgelaufener Abholcode erzeugt.';
  exception when others then
    if sqlerrm like 'TEST 22%' then raise; end if;
  end;

  perform public.po_create_pickup_code(s_conf, hash1, now() + interval '1 day');

  -- Falscher Code scheitert
  begin
    perform public.po_deliver_shipment(s_conf, 'Empfänger', 'x/c.png', sigsha, hash2);
    raise exception 'TEST 23 fehlgeschlagen: falscher Abholcode akzeptiert.';
  exception when others then
    if sqlerrm like 'TEST 23%' then raise; end if;
  end;
  -- Abholung ohne Code scheitert
  begin
    perform public.po_deliver_shipment(s_conf, 'Empfänger', 'x/c.png', sigsha, null);
    raise exception 'TEST 23b fehlgeschlagen: Abholung ohne Code möglich.';
  exception when others then
    if sqlerrm like 'TEST 23b%' then raise; end if;
  end;

  -- Richtiger Code funktioniert genau einmal
  perform public.po_deliver_shipment(s_conf, 'Empfänger', 'x/c.png', sigsha, hash1);
  execute 'reset role';
  if not exists (select 1 from public.pickup_codes where code_hash = hash1 and used_at is not null) then
    raise exception 'TEST 24 fehlgeschlagen: Einlösung wurde nicht protokolliert.';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'pickup_code.redeemed') then
    raise exception 'TEST 24b fehlgeschlagen: Einlösung nicht im Audit-Log.';
  end if;

  raise notice 'ALLE DB-TESTS BESTANDEN';
end
$test$;

rollback;
