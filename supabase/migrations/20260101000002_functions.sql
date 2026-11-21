-- =====================================================================
-- PostOffice - Migration 2: Hilfsfunktionen und Geschäftsprozesse
-- Alle schreibenden Prozesse laufen als SECURITY DEFINER mit eigener
-- Berechtigungsprüfung (auth.uid()) und festem search_path.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für Rollen (stable, security definer -> keine RLS-Rekursion)
-- ---------------------------------------------------------------------
create or replace function public.po_current_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.po_current_department()
returns uuid language sql stable security definer set search_path = public as $$
  select p.department_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.po_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.po_current_role() in ('administrator', 'poststelle'), false)
$$;

create or replace function public.po_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.po_current_role() = 'administrator', false)
$$;

-- Sichtbarkeit einer Sendung (Grundlage ALLER Leserechte auf Sendungsdaten).
create or replace function public.po_can_view_shipment(p_shipment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.shipments s
    where s.id = p_shipment
      and auth.uid() is not null
      and public.po_current_role() is not null
      and (
        public.po_current_role() in ('administrator', 'poststelle')
        or (public.po_current_role() = 'zusteller' and s.assigned_courier_id = auth.uid())
        or s.recipient_id = auth.uid()
        or s.sender_profile_id = auth.uid()
        or s.created_by = auth.uid()
        or exists (
          select 1 from public.shipment_access_grants g
          where g.shipment_id = s.id
            and g.profile_id = auth.uid()
            and (g.expires_at is null or g.expires_at > now())
        )
        -- Abteilungsverantwortliche sehen NUR nicht vertrauliche Sendungen der eigenen Abteilung.
        or (
          public.po_current_role() = 'abteilungsleiter'
          and not s.confidential
          and s.recipient_department_id is not null
          and s.recipient_department_id = public.po_current_department()
        )
      )
  )
$$;

-- Darf der Aufrufer die Sendung bearbeiten (Poststelle/Admin oder zugewiesener Zusteller)?
create or replace function public.po_can_process_shipment(p_shipment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shipments s
    where s.id = p_shipment
      and auth.uid() is not null
      and (
        public.po_is_staff()
        or (public.po_current_role() = 'zusteller' and s.assigned_courier_id = auth.uid())
      )
  )
$$;

-- Namensverzeichnis (nur id, Name, Rolle, Abteilung aktiver Benutzer).
create or replace view public.directory as
  select p.id, p.full_name, p.role, p.department_id
  from public.profiles p
  where p.is_active;

-- ---------------------------------------------------------------------
-- Interne Helfer (NICHT für Clients freigegeben, siehe Migration 3)
-- ---------------------------------------------------------------------
create or replace function public.po_log_event(
  p_shipment uuid, p_type text, p_from public.shipment_status,
  p_to public.shipment_status, p_comment text, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.shipment_events (shipment_id, event_type, from_status, to_status, comment, actor_id, metadata)
  values (p_shipment, p_type, p_from, p_to, nullif(btrim(p_comment), ''), auth.uid(), coalesce(p_metadata, '{}'::jsonb));
end $$;

create or replace function public.po_audit(
  p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public.po_notify(
  p_user uuid, p_type text, p_title text, p_body text, p_shipment uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  -- Keine Benachrichtigung an sich selbst und nur an aktive Benutzer.
  if p_user = auth.uid() then return; end if;
  insert into public.notifications (user_id, type, title, body, shipment_id)
  select p_user, p_type, p_title, p_body, p_shipment
  where exists (select 1 from public.profiles where id = p_user and is_active);
end $$;

create or replace function public.po_notify_staff(
  p_type text, p_title text, p_body text, p_shipment uuid
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where is_active and role in ('poststelle', 'administrator') loop
    perform public.po_notify(r.id, p_type, p_title, p_body, p_shipment);
  end loop;
end $$;

create or replace function public.po_require_active_user()
returns public.user_role language plpgsql stable security definer set search_path = public as $$
declare r public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  r := public.po_current_role();
  if r is null then
    raise exception 'Benutzerkonto ist nicht aktiv.' using errcode = '42501';
  end if;
  return r;
end $$;

create or replace function public.po_status_label(s public.shipment_status)
returns text language sql immutable as $$
  select case s
    when 'erstellt' then 'Erstellt'
    when 'eingegangen' then 'Bei der Poststelle eingegangen'
    when 'zugewiesen' then 'Zusteller zugewiesen'
    when 'uebernommen' then 'Übernommen'
    when 'im_transport' then 'Im Transport'
    when 'in_zustellung' then 'In Zustellung'
    when 'abholbereit' then 'Zur Abholung bereit'
    when 'zugestellt' then 'Zugestellt'
    when 'nicht_zustellbar' then 'Nicht zustellbar'
    when 'rueckgabe_eingeleitet' then 'Rücksendung eingeleitet'
    when 'zurueckgesendet' then 'Zurückgesendet'
  end
$$;

-- ---------------------------------------------------------------------
-- Sendung erstellen
-- ---------------------------------------------------------------------
create or replace function public.po_create_shipment(
  p_sender_name text,
  p_sender_profile_id uuid,
  p_recipient_id uuid,
  p_recipient_name text,
  p_recipient_department_id uuid,
  p_location_id uuid,
  p_type public.shipment_type,
  p_method public.shipping_method,
  p_direction public.shipment_direction,
  p_priority public.shipment_priority,
  p_subject text,
  p_description text,
  p_confidential boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  v_recipient_name text := btrim(coalesce(p_recipient_name, ''));
  v_department uuid := p_recipient_department_id;
  v_sender_name text := btrim(coalesce(p_sender_name, ''));
  v_id uuid;
  v_number text;
begin
  if r = 'zusteller' then
    raise exception 'Zusteller dürfen keine Sendungen erfassen.' using errcode = '42501';
  end if;
  -- Nicht-Poststellen-Benutzer dürfen nur ausgehende/interne Sendungen anlegen.
  if r in ('mitarbeiter', 'abteilungsleiter') and p_direction = 'eingehend' then
    raise exception 'Eingehende Sendungen werden von der Poststelle erfasst.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_subject, ''))) not between 1 and 200 then
    raise exception 'Betreff muss 1 bis 200 Zeichen lang sein.';
  end if;

  if p_recipient_id is not null then
    select p.full_name, coalesce(v_department, p.department_id)
      into v_recipient_name, v_department
    from public.profiles p where p.id = p_recipient_id and p.is_active;
    if not found then
      raise exception 'Empfänger nicht gefunden oder inaktiv.';
    end if;
    if v_recipient_name = '' then v_recipient_name := btrim(coalesce(p_recipient_name, '')); end if;
  end if;
  if v_recipient_name = '' then
    raise exception 'Empfänger fehlt.';
  end if;

  if v_sender_name = '' then
    select p.full_name into v_sender_name from public.profiles p where p.id = auth.uid();
  end if;
  if coalesce(v_sender_name, '') = '' then
    raise exception 'Absender fehlt.';
  end if;

  insert into public.shipments (
    shipment_number, sender_name, sender_profile_id, recipient_id, recipient_name,
    recipient_department_id, location_id, shipment_type, shipping_method, direction,
    priority, subject, description, confidential, created_by
  ) values (
    'x', v_sender_name,
    case when r in ('administrator', 'poststelle') then p_sender_profile_id else auth.uid() end,
    p_recipient_id, v_recipient_name, v_department, p_location_id, p_type, p_method,
    p_direction, p_priority, btrim(p_subject), coalesce(p_description, ''),
    coalesce(p_confidential, false), auth.uid()
  ) returning id, shipment_number into v_id, v_number;

  perform public.po_log_event(v_id, 'erstellt', null, 'erstellt', 'Sendung erstellt');
  perform public.po_audit('shipment.create', 'shipment', v_id::text,
    jsonb_build_object('shipment_number', v_number, 'confidential', coalesce(p_confidential, false)));

  -- Poststelle erfasst eingehende Sendungen direkt als "eingegangen".
  if r in ('administrator', 'poststelle') and p_direction = 'eingehend' then
    perform set_config('po.status_change', 'on', true);
    update public.shipments set status = 'eingegangen' where id = v_id;
    perform set_config('po.status_change', 'off', true);
    perform public.po_log_event(v_id, 'status', 'erstellt', 'eingegangen', 'Sendung bei der Poststelle eingegangen');
    perform public.po_notify(p_recipient_id, 'neue_sendung', 'Neue Sendung eingegangen',
      v_number || ': ' || btrim(p_subject), v_id);
  elsif r not in ('administrator', 'poststelle') then
    perform public.po_notify_staff('neue_sendung', 'Neue Sendung erfasst',
      v_number || ': ' || btrim(p_subject), v_id);
  end if;

  return jsonb_build_object('id', v_id, 'shipment_number', v_number);
end $$;

-- ---------------------------------------------------------------------
-- Allgemeiner Statuswechsel (außer zugewiesen/zugestellt: eigene Prozesse)
-- ---------------------------------------------------------------------
create or replace function public.po_change_status(
  p_shipment uuid,
  p_to public.shipment_status,
  p_comment text default null,
  p_reason public.return_reason default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
  v_label text;
begin
  select * into s from public.shipments where id = p_shipment for update;
  if not found or not public.po_can_view_shipment(p_shipment) then
    raise exception 'Sendung nicht gefunden.' using errcode = 'P0002';
  end if;

  if p_to = 'zugestellt' then
    raise exception 'Zustellungen sind nur über die Zustellbestätigung mit Unterschrift möglich.';
  end if;
  if p_to = 'zugewiesen' then
    raise exception 'Zuweisungen erfolgen über die Zustellerzuweisung.';
  end if;

  if not exists (select 1 from public.status_transitions t where t.from_status = s.status and t.to_status = p_to) then
    raise exception 'Statuswechsel von "%" nach "%" ist nicht erlaubt (Sendung wurde evtl. bereits verarbeitet).',
      public.po_status_label(s.status), public.po_status_label(p_to) using errcode = 'P0001';
  end if;

  if p_to in ('eingegangen', 'abholbereit', 'rueckgabe_eingeleitet', 'zurueckgesendet') then
    if r not in ('administrator', 'poststelle') then
      raise exception 'Keine Berechtigung für diesen Statuswechsel.' using errcode = '42501';
    end if;
  elsif p_to in ('uebernommen', 'im_transport', 'in_zustellung', 'nicht_zustellbar') then
    if not (r in ('administrator', 'poststelle') or (r = 'zusteller' and s.assigned_courier_id = auth.uid())) then
      raise exception 'Keine Berechtigung für diesen Statuswechsel.' using errcode = '42501';
    end if;
  end if;

  -- Abholbereit nur bei Poststelle oder zugewiesenem Zusteller aus "in_zustellung".
  if p_to = 'abholbereit' and r = 'zusteller' then
    raise exception 'Nur die Poststelle kann Sendungen zur Abholung bereitstellen.' using errcode = '42501';
  end if;

  if p_to in ('nicht_zustellbar', 'rueckgabe_eingeleitet') and p_reason is null then
    raise exception 'Bitte einen Grund angeben.';
  end if;

  perform set_config('po.status_change', 'on', true);
  update public.shipments
     set status = p_to,
         return_reason = case when p_to in ('nicht_zustellbar', 'rueckgabe_eingeleitet') then p_reason
                              when p_to in ('eingegangen', 'abholbereit') then null
                              else return_reason end,
         return_comment = case when p_to in ('nicht_zustellbar', 'rueckgabe_eingeleitet') then nullif(btrim(p_comment), '')
                               when p_to in ('eingegangen', 'abholbereit') then null
                               else return_comment end
   where id = p_shipment;
  perform set_config('po.status_change', 'off', true);

  v_label := public.po_status_label(p_to);
  perform public.po_log_event(p_shipment, 'status', s.status, p_to,
    coalesce(nullif(btrim(p_comment), ''), v_label),
    case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason', p_reason) end);
  perform public.po_audit('shipment.status', 'shipment', p_shipment::text,
    jsonb_build_object('from', s.status, 'to', p_to, 'reason', p_reason));

  -- Benachrichtigungen
  if p_to = 'eingegangen' then
    perform public.po_notify(s.recipient_id, 'neue_sendung', 'Neue Sendung eingegangen',
      s.shipment_number || ': ' || s.subject, p_shipment);
  elsif p_to = 'abholbereit' then
    perform public.po_notify(s.recipient_id, 'abholbereit', 'Sendung liegt zur Abholung bereit',
      s.shipment_number || ': ' || s.subject, p_shipment);
  elsif p_to = 'nicht_zustellbar' then
    perform public.po_notify_staff('zustellung_fehlgeschlagen', 'Zustellung fehlgeschlagen',
      s.shipment_number || ': ' || s.subject, p_shipment);
    perform public.po_notify(s.created_by, 'zustellung_fehlgeschlagen', 'Zustellung fehlgeschlagen',
      s.shipment_number || ': ' || s.subject, p_shipment);
  elsif p_to = 'rueckgabe_eingeleitet' then
    perform public.po_notify(s.created_by, 'ruecksendung', 'Rücksendung erstellt',
      s.shipment_number || ': ' || s.subject, p_shipment);
    perform public.po_notify(s.recipient_id, 'ruecksendung', 'Rücksendung erstellt',
      s.shipment_number || ': ' || s.subject, p_shipment);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Zusteller zuweisen / umbuchen
-- ---------------------------------------------------------------------
create or replace function public.po_assign_shipment(
  p_shipment uuid, p_courier uuid, p_comment text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
begin
  if r not in ('administrator', 'poststelle') then
    raise exception 'Keine Berechtigung zur Zustellerzuweisung.' using errcode = '42501';
  end if;
  select * into s from public.shipments where id = p_shipment for update;
  if not found then
    raise exception 'Sendung nicht gefunden.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_courier and p.is_active and p.role = 'zusteller') then
    raise exception 'Der gewählte Benutzer ist kein aktiver Zusteller.';
  end if;
  if not exists (select 1 from public.status_transitions t where t.from_status = s.status and t.to_status = 'zugewiesen') then
    raise exception 'Zuweisung im Status "%" nicht möglich.', public.po_status_label(s.status);
  end if;

  update public.delivery_assignments set ended_at = now()
   where shipment_id = p_shipment and ended_at is null;
  insert into public.delivery_assignments (shipment_id, courier_id, assigned_by, comment)
  values (p_shipment, p_courier, auth.uid(), nullif(btrim(p_comment), ''));

  perform set_config('po.status_change', 'on', true);
  update public.shipments set status = 'zugewiesen', assigned_courier_id = p_courier,
         return_reason = null, return_comment = null
   where id = p_shipment;
  perform set_config('po.status_change', 'off', true);

  perform public.po_log_event(p_shipment, 'zuweisung', s.status, 'zugewiesen',
    coalesce(nullif(btrim(p_comment), ''), 'Sendung einem Zusteller zugewiesen'),
    jsonb_build_object('courier_id', p_courier));
  perform public.po_audit('shipment.assign', 'shipment', p_shipment::text,
    jsonb_build_object('courier_id', p_courier));
  perform public.po_notify(p_courier, 'zuweisung', 'Neue Zustellerzuweisung',
    s.shipment_number || ': ' || s.subject, p_shipment);
end $$;

-- ---------------------------------------------------------------------
-- Notiz / Problemdokumentation im Verlauf
-- ---------------------------------------------------------------------
create or replace function public.po_add_note(p_shipment uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.user_role := public.po_require_active_user();
begin
  if not public.po_can_process_shipment(p_shipment) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_comment, ''))) not between 1 and 2000 then
    raise exception 'Notiz muss 1 bis 2000 Zeichen lang sein.';
  end if;
  perform public.po_log_event(p_shipment, 'notiz', null, null, p_comment);
  perform public.po_audit('shipment.note', 'shipment', p_shipment::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Archivieren
-- ---------------------------------------------------------------------
create or replace function public.po_archive_shipment(p_shipment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
begin
  if r not in ('administrator', 'poststelle') then
    raise exception 'Keine Berechtigung zum Archivieren.' using errcode = '42501';
  end if;
  select * into s from public.shipments where id = p_shipment for update;
  if not found then raise exception 'Sendung nicht gefunden.' using errcode = 'P0002'; end if;
  if s.status not in ('zugestellt', 'zurueckgesendet') then
    raise exception 'Nur abgeschlossene Sendungen können archiviert werden.';
  end if;
  if s.archived_at is not null then return; end if;
  perform set_config('po.status_change', 'on', true);
  update public.shipments set archived_at = now() where id = p_shipment;
  perform set_config('po.status_change', 'off', true);
  perform public.po_log_event(p_shipment, 'archiviert', null, null, 'Sendung archiviert');
  perform public.po_audit('shipment.archive', 'shipment', p_shipment::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Abholcode erzeugen (Klartext entsteht nur im Server-Prozess, hier nur Hash)
-- ---------------------------------------------------------------------
create or replace function public.po_create_pickup_code(
  p_shipment uuid, p_code_hash text, p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
  v_id uuid;
begin
  select * into s from public.shipments where id = p_shipment for update;
  if not found or not public.po_can_view_shipment(p_shipment) then
    raise exception 'Sendung nicht gefunden.' using errcode = 'P0002';
  end if;
  if not (r in ('administrator', 'poststelle') or s.recipient_id = auth.uid()) then
    raise exception 'Keine Berechtigung für Abholcodes.' using errcode = '42501';
  end if;
  if s.status <> 'abholbereit' then
    raise exception 'Abholcodes gibt es nur für Sendungen mit Status "Zur Abholung bereit".';
  end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungültiger Code-Hash.';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '14 days' then
    raise exception 'Ablaufdatum muss in der Zukunft und höchstens 14 Tage entfernt liegen.';
  end if;

  -- Frühere, ungenutzte Codes sofort entwerten.
  update public.pickup_codes set expires_at = now()
   where shipment_id = p_shipment and used_at is null and expires_at > now();

  insert into public.pickup_codes (shipment_id, code_hash, expires_at, created_by)
  values (p_shipment, p_code_hash, p_expires_at, auth.uid())
  returning id into v_id;

  perform public.po_log_event(p_shipment, 'abholcode', null, null, 'Abholcode erzeugt');
  perform public.po_audit('pickup_code.create', 'shipment', p_shipment::text,
    jsonb_build_object('expires_at', p_expires_at));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Zustellung bestätigen - ATOMAR: Unterschrift speichern + Status setzen
-- ---------------------------------------------------------------------
create or replace function public.po_deliver_shipment(
  p_shipment uuid,
  p_recipient_name text,
  p_signature_path text,
  p_signature_sha256 text,
  p_pickup_code_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
  v_name text := btrim(coalesce(p_recipient_name, ''));
  v_code uuid;
begin
  select * into s from public.shipments where id = p_shipment for update;
  if not found or not public.po_can_view_shipment(p_shipment) then
    raise exception 'Sendung nicht gefunden.' using errcode = 'P0002';
  end if;

  if s.status = 'zugestellt' then
    raise exception 'Sendung wurde bereits zugestellt.' using errcode = 'P0001';
  end if;
  if s.status not in ('in_zustellung', 'abholbereit') then
    raise exception 'Zustellung im Status "%" nicht möglich.', public.po_status_label(s.status);
  end if;

  if s.status = 'in_zustellung' then
    if not (r in ('administrator', 'poststelle') or (r = 'zusteller' and s.assigned_courier_id = auth.uid())) then
      raise exception 'Nur der zugewiesene Zusteller darf zustellen.' using errcode = '42501';
    end if;
  else
    -- Abholung: Ausgabe durch Poststelle gegen gültigen Abholcode.
    if r not in ('administrator', 'poststelle') then
      raise exception 'Nur die Poststelle gibt Abholungen aus.' using errcode = '42501';
    end if;
    if p_pickup_code_hash is null then
      raise exception 'Für die Abholung ist ein gültiger Abholcode erforderlich.';
    end if;
  end if;

  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Empfängername (2-160 Zeichen) ist Pflicht.';
  end if;
  if coalesce(btrim(p_signature_path), '') = '' or coalesce(p_signature_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Gültige Unterschrift fehlt.';
  end if;

  if p_pickup_code_hash is not null then
    update public.pickup_codes
       set used_at = now(), used_by = auth.uid()
     where shipment_id = p_shipment
       and code_hash = p_pickup_code_hash
       and used_at is null
       and expires_at > now()
    returning id into v_code;
    if v_code is null then
      perform public.po_audit('pickup_code.rejected', 'shipment', p_shipment::text, '{}'::jsonb);
      raise exception 'Abholcode ungültig, abgelaufen oder bereits verwendet.';
    end if;
    perform public.po_audit('pickup_code.redeemed', 'shipment', p_shipment::text,
      jsonb_build_object('pickup_code_id', v_code));
  end if;

  insert into public.signatures (shipment_id, recipient_name, storage_path, sha256, captured_by)
  values (p_shipment, v_name, p_signature_path, p_signature_sha256, auth.uid());

  perform set_config('po.status_change', 'on', true);
  update public.shipments set status = 'zugestellt', delivered_at = now() where id = p_shipment;
  perform set_config('po.status_change', 'off', true);

  if s.assigned_courier_id is not null then
    update public.delivery_route_stops st set status = 'zugestellt'
     where st.shipment_id = p_shipment and st.status = 'offen';
  end if;

  perform public.po_log_event(p_shipment, 'status', s.status, 'zugestellt',
    'Sendung zugestellt an ' || v_name, jsonb_build_object('recipient_name', v_name));
  perform public.po_audit('shipment.deliver', 'shipment', p_shipment::text,
    jsonb_build_object('recipient_name', v_name, 'via_pickup_code', v_code is not null));

  perform public.po_notify(s.recipient_id, 'zugestellt', 'Sendung wurde zugestellt',
    s.shipment_number || ': ' || s.subject, p_shipment);
  perform public.po_notify(s.created_by, 'zugestellt', 'Sendung wurde zugestellt',
    s.shipment_number || ': ' || s.subject, p_shipment);

  return jsonb_build_object('shipment_id', p_shipment, 'shipment_number', s.shipment_number);
end $$;

-- ---------------------------------------------------------------------
-- Freigaben für vertrauliche Sendungen
-- ---------------------------------------------------------------------
create or replace function public.po_grant_access(
  p_shipment uuid, p_profile uuid, p_expires_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  s public.shipments;
begin
  select * into s from public.shipments where id = p_shipment;
  if not found then raise exception 'Sendung nicht gefunden.' using errcode = 'P0002'; end if;
  if not (r in ('administrator', 'poststelle') or s.created_by = auth.uid()) then
    raise exception 'Keine Berechtigung für Freigaben.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and is_active) then
    raise exception 'Benutzer nicht gefunden.';
  end if;
  insert into public.shipment_access_grants (shipment_id, profile_id, granted_by, expires_at)
  values (p_shipment, p_profile, auth.uid(), p_expires_at)
  on conflict (shipment_id, profile_id) do update set expires_at = excluded.expires_at, granted_by = auth.uid();
  perform public.po_log_event(p_shipment, 'freigabe', null, null, 'Zugriff freigegeben');
  perform public.po_audit('shipment.grant', 'shipment', p_shipment::text, jsonb_build_object('profile_id', p_profile));
  perform public.po_notify(p_profile, 'freigabe', 'Sendung für Sie freigegeben', s.shipment_number, p_shipment);
end $$;

create or replace function public.po_revoke_access(p_grant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.po_require_active_user();
  g public.shipment_access_grants;
  s public.shipments;
begin
  select * into g from public.shipment_access_grants where id = p_grant;
  if not found then return; end if;
  select * into s from public.shipments where id = g.shipment_id;
  if not (r in ('administrator', 'poststelle') or s.created_by = auth.uid()) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  delete from public.shipment_access_grants where id = p_grant;
  perform public.po_log_event(g.shipment_id, 'freigabe', null, null, 'Freigabe entzogen');
  perform public.po_audit('shipment.revoke', 'shipment', g.shipment_id::text, jsonb_build_object('profile_id', g.profile_id));
end $$;

-- ---------------------------------------------------------------------
-- Dashboard und Statistiken (SECURITY INVOKER: RLS gilt für den Aufrufer)
-- ---------------------------------------------------------------------
create or replace function public.po_dashboard_counts()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  r public.user_role := public.po_current_role();
  res jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'incoming', count(*) filter (where direction = 'eingehend'),
    'outgoing', count(*) filter (where direction = 'ausgehend'),
    'undelivered', count(*) filter (where status not in ('zugestellt', 'zurueckgesendet')),
    'delivered', count(*) filter (where status = 'zugestellt'),
    'returns', count(*) filter (where status in ('rueckgabe_eingeleitet', 'zurueckgesendet')),
    'problems', count(*) filter (where status = 'nicht_zustellbar'),
    'open_tasks', case
      when r in ('administrator', 'poststelle') then
        count(*) filter (where status in ('erstellt', 'eingegangen', 'nicht_zustellbar', 'rueckgabe_eingeleitet'))
      when r = 'zusteller' then
        count(*) filter (where status in ('zugewiesen', 'uebernommen', 'im_transport', 'in_zustellung'))
      else
        count(*) filter (where status = 'abholbereit' and recipient_id = auth.uid())
    end
  ) into res
  from public.shipments;
  return res;
end $$;

create or replace function public.po_stats_series(p_unit text, p_periods integer default 12)
returns table (period date, created bigint, delivered bigint, returned bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  step interval;
begin
  if p_unit not in ('day', 'week', 'month') then
    raise exception 'Ungültige Einheit: %', p_unit;
  end if;
  if p_periods < 1 or p_periods > 366 then
    raise exception 'Ungültige Periodenzahl.';
  end if;
  step := case p_unit when 'day' then interval '1 day'
                      when 'week' then interval '1 week'
                      else interval '1 month' end;
  return query
    with series as (
      select generate_series(
        date_trunc(p_unit, now() at time zone 'Europe/Berlin') - (p_periods - 1) * step,
        date_trunc(p_unit, now() at time zone 'Europe/Berlin'),
        step
      )::date as period
    )
    select se.period,
           count(s.id) as created,
           count(s.id) filter (where s.status = 'zugestellt') as delivered,
           count(s.id) filter (where s.status in ('rueckgabe_eingeleitet', 'zurueckgesendet')) as returned
    from series se
    left join public.shipments s
      on date_trunc(p_unit, s.created_at at time zone 'Europe/Berlin')::date = se.period
    group by se.period
    order by se.period;
end $$;

create or replace function public.po_stats_by_department()
returns table (department text, total bigint, delivered bigint, returned bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(d.name, 'Ohne Abteilung') as department,
         count(s.id) as total,
         count(s.id) filter (where s.status = 'zugestellt') as delivered,
         count(s.id) filter (where s.status in ('rueckgabe_eingeleitet', 'zurueckgesendet')) as returned
  from public.shipments s
  left join public.departments d on d.id = s.recipient_department_id
  group by d.name
  order by total desc
$$;

create or replace function public.po_stats_by_courier()
returns table (courier text, assigned bigint, delivered bigint, problems bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(dir.full_name, 'Unbekannt') as courier,
         count(s.id) as assigned,
         count(s.id) filter (where s.status = 'zugestellt') as delivered,
         count(s.id) filter (where s.status = 'nicht_zustellbar') as problems
  from public.shipments s
  join public.directory dir on dir.id = s.assigned_courier_id
  group by dir.full_name
  order by assigned desc
$$;

create or replace function public.po_stats_rates()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'delivery_rate', case when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where status = 'zugestellt') / count(*), 1) end,
    'return_rate', case when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where status in ('rueckgabe_eingeleitet', 'zurueckgesendet')) / count(*), 1) end,
    'avg_processing_hours', coalesce(
      round((avg(extract(epoch from (delivered_at - created_at)) / 3600.0)
             filter (where status = 'zugestellt' and delivered_at is not null))::numeric, 1), 0)
  )
  from public.shipments
$$;
