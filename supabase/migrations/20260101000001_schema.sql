-- =====================================================================
-- PostOffice - Migration 1: Schema (Typen, Tabellen, Indizes, Trigger)
-- Ausführen im Supabase SQL Editor oder per Supabase CLI.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role as enum
  ('administrator', 'poststelle', 'zusteller', 'mitarbeiter', 'abteilungsleiter');

create type public.shipment_type as enum ('brief', 'paket', 'dokument', 'sonstiges');

create type public.shipping_method as enum
  ('hauspost', 'post', 'paketdienst', 'kurier', 'persoenlich');

create type public.shipment_direction as enum ('eingehend', 'ausgehend', 'intern');

create type public.shipment_priority as enum ('niedrig', 'normal', 'hoch', 'dringend');

create type public.shipment_status as enum (
  'erstellt', 'eingegangen', 'zugewiesen', 'uebernommen', 'im_transport',
  'in_zustellung', 'abholbereit', 'zugestellt', 'nicht_zustellbar',
  'rueckgabe_eingeleitet', 'zurueckgesendet'
);

create type public.return_reason as enum (
  'empfaenger_unbekannt', 'nicht_angetroffen', 'annahme_verweigert',
  'beschaedigt', 'falsche_abteilung', 'sonstiges'
);

create type public.document_kind as enum
  ('empfangsbestaetigung', 'unterschrift', 'foto', 'etikett', 'sonstiges');

create type public.photo_category as enum
  ('beschaedigung', 'ablageort', 'zustellproblem', 'ruecksendung', 'sonstiges');

create type public.route_status as enum ('geplant', 'aktiv', 'abgeschlossen');
create type public.stop_status as enum ('offen', 'zugestellt', 'uebersprungen');

-- ---------------------------------------------------------------------
-- Allgemeine Trigger-Funktionen
-- ---------------------------------------------------------------------
create or replace function public.po_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.po_block_modification()
returns trigger language plpgsql as $$
begin
  raise exception 'Datensätze in %.% sind unveränderlich (% nicht erlaubt).',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 120),
  code text not null unique check (length(btrim(code)) between 1 and 20),
  head_profile_id uuid,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  building text not null check (length(btrim(building)) between 1 and 80),
  floor text not null default '' check (length(floor) <= 40),
  room text not null default '' check (length(room) <= 40),
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (building, floor, room)
);
create index locations_department_idx on public.locations (department_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (length(full_name) <= 120),
  role public.user_role not null default 'mitarbeiter',
  department_id uuid references public.departments (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;
create index profiles_department_idx on public.profiles (department_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.po_set_updated_at();

alter table public.departments
  add constraint departments_head_fk
  foreign key (head_profile_id) references public.profiles (id) on delete set null;

-- Profil automatisch beim Anlegen eines Auth-Benutzers erzeugen.
-- Neue Benutzer erhalten IMMER die Rolle 'mitarbeiter'. Rollen vergibt nur ein Administrator.
create or replace function public.po_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.po_handle_new_user();

-- ---------------------------------------------------------------------
-- Sendungen
-- ---------------------------------------------------------------------
create table public.shipment_counters (
  year integer primary key,
  last_value integer not null default 0
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique
    check (shipment_number ~ '^PO-[0-9]{4}-[0-9]{6}$'),
  sender_name text not null check (length(btrim(sender_name)) between 1 and 160),
  sender_profile_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete set null,
  recipient_name text not null check (length(btrim(recipient_name)) between 1 and 160),
  recipient_department_id uuid references public.departments (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  shipment_type public.shipment_type not null default 'brief',
  shipping_method public.shipping_method not null default 'hauspost',
  direction public.shipment_direction not null default 'intern',
  priority public.shipment_priority not null default 'normal',
  subject text not null check (length(btrim(subject)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  status public.shipment_status not null default 'erstellt',
  confidential boolean not null default false,
  created_by uuid not null references public.profiles (id),
  assigned_courier_id uuid references public.profiles (id) on delete set null,
  return_reason public.return_reason,
  return_comment text,
  delivered_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_status_idx on public.shipments (status);
create index shipments_recipient_idx on public.shipments (recipient_id);
create index shipments_sender_idx on public.shipments (sender_profile_id);
create index shipments_courier_idx on public.shipments (assigned_courier_id);
create index shipments_department_idx on public.shipments (recipient_department_id);
create index shipments_created_at_idx on public.shipments (created_at desc);
create index shipments_created_by_idx on public.shipments (created_by);

-- Sendungsnummer PO-JJJJ-NNNNNN (pro Jahr fortlaufend, atomar über Zähler).
create or replace function public.po_next_shipment_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  y integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  n integer;
begin
  insert into public.shipment_counters as c (year, last_value)
  values (y, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning c.last_value into n;
  return 'PO-' || y::text || '-' || lpad(n::text, 6, '0');
end $$;

create or replace function public.po_shipments_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Die Sendungsnummer wird IMMER serverseitig vergeben; Vorgaben werden überschrieben.
  new.shipment_number := public.po_next_shipment_number();
  return new;
end $$;

create trigger shipments_before_insert before insert on public.shipments
  for each row execute function public.po_shipments_before_insert();

-- Schutz vor unzulässigen Änderungen (zusätzlich zu Column-Grants und RLS).
create or replace function public.po_shipments_before_update()
returns trigger language plpgsql as $$
declare
  guard text := coalesce(current_setting('po.status_change', true), '');
begin
  if new.shipment_number is distinct from old.shipment_number then
    raise exception 'Die Sendungsnummer ist unveränderlich.';
  end if;
  if new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Erstellungsdaten sind unveränderlich.';
  end if;

  if guard <> 'on' then
    if new.status is distinct from old.status then
      raise exception 'Statusänderungen sind nur über geprüfte Geschäftsprozesse erlaubt.';
    end if;
    if new.assigned_courier_id is distinct from old.assigned_courier_id
       or new.delivered_at is distinct from old.delivered_at
       or new.return_reason is distinct from old.return_reason
       or new.return_comment is distinct from old.return_comment
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Dieses Feld ist nur über geprüfte Geschäftsprozesse änderbar.';
    end if;
  end if;

  -- Abgeschlossene Sendungen sind inhaltlich eingefroren.
  if old.status in ('zugestellt', 'zurueckgesendet') and guard <> 'on' then
    raise exception 'Abgeschlossene Sendungen können nicht mehr bearbeitet werden.';
  end if;

  -- Zugestellt NUR mit gespeicherter Unterschrift (zweite, unabhängige Absicherung).
  if new.status = 'zugestellt' and old.status is distinct from 'zugestellt' then
    if not exists (select 1 from public.signatures s where s.shipment_id = new.id) then
      raise exception 'Zustellung ohne gültige Unterschrift ist nicht erlaubt.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Hinweis: Trigger wird nach Anlage der Tabelle "signatures" erstellt (siehe unten).

-- Erlaubte Statusübergänge (Single Source of Truth in der Datenbank).
create table public.status_transitions (
  from_status public.shipment_status not null,
  to_status public.shipment_status not null,
  primary key (from_status, to_status)
);

insert into public.status_transitions (from_status, to_status) values
  ('erstellt', 'eingegangen'),
  ('eingegangen', 'zugewiesen'),
  ('eingegangen', 'abholbereit'),
  ('zugewiesen', 'zugewiesen'),
  ('zugewiesen', 'uebernommen'),
  ('uebernommen', 'im_transport'),
  ('uebernommen', 'in_zustellung'),
  ('uebernommen', 'nicht_zustellbar'),
  ('im_transport', 'in_zustellung'),
  ('im_transport', 'nicht_zustellbar'),
  ('in_zustellung', 'zugestellt'),
  ('in_zustellung', 'nicht_zustellbar'),
  ('in_zustellung', 'abholbereit'),
  ('abholbereit', 'zugestellt'),
  ('abholbereit', 'rueckgabe_eingeleitet'),
  ('nicht_zustellbar', 'eingegangen'),
  ('nicht_zustellbar', 'zugewiesen'),
  ('nicht_zustellbar', 'abholbereit'),
  ('nicht_zustellbar', 'rueckgabe_eingeleitet'),
  ('rueckgabe_eingeleitet', 'zurueckgesendet');

-- Verlauf (unveränderlich)
create table public.shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  event_type text not null check (length(event_type) between 1 and 40),
  from_status public.shipment_status,
  to_status public.shipment_status,
  comment text check (comment is null or length(comment) <= 2000),
  actor_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index shipment_events_shipment_idx on public.shipment_events (shipment_id, created_at);
create trigger shipment_events_immutable
  before update or delete on public.shipment_events
  for each row execute function public.po_block_modification();

-- Zustellerzuweisungen
create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  courier_id uuid not null references public.profiles (id),
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  comment text check (comment is null or length(comment) <= 1000)
);
create unique index delivery_assignments_one_active
  on public.delivery_assignments (shipment_id) where ended_at is null;
create index delivery_assignments_courier_idx on public.delivery_assignments (courier_id);

-- Zustellrouten (intern: Gebäude / Etage / Raum)
create table public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  courier_id uuid not null references public.profiles (id),
  route_date date not null default current_date,
  status public.route_status not null default 'geplant',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index delivery_routes_courier_idx on public.delivery_routes (courier_id, route_date);

create table public.delivery_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  location_id uuid references public.locations (id) on delete set null,
  stop_order integer not null check (stop_order > 0),
  status public.stop_status not null default 'offen',
  unique (route_id, shipment_id),
  unique (route_id, stop_order) deferrable initially deferred
);

-- Unterschriften (unveränderlich, genau eine pro Sendung)
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments (id) on delete restrict,
  recipient_name text not null check (length(btrim(recipient_name)) between 2 and 160),
  storage_path text not null check (length(btrim(storage_path)) > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_by uuid not null references public.profiles (id),
  captured_at timestamptz not null default now()
);
create trigger signatures_immutable
  before update or delete on public.signatures
  for each row execute function public.po_block_modification();

-- Jetzt kann der Sendungs-Update-Trigger angelegt werden (referenziert signatures).
create trigger shipments_before_update before update on public.shipments
  for each row execute function public.po_shipments_before_update();

-- Dokumentenarchiv
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  kind public.document_kind not null,
  storage_bucket text not null,
  storage_path text not null,
  filename text not null check (length(filename) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shipment_id, storage_bucket, storage_path)
);
create index documents_shipment_idx on public.documents (shipment_id, kind);

create table public.shipment_photos (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  storage_path text not null unique,
  category public.photo_category not null default 'sonstiges',
  note text check (note is null or length(note) <= 1000),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  taken_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index shipment_photos_shipment_idx on public.shipment_photos (shipment_id);

-- Abholcodes (nur Hash, einmalig, mit Ablauf)
create table public.pickup_codes (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pickup_codes_shipment_idx on public.pickup_codes (shipment_id);

-- Freigaben für vertrauliche Sendungen
create table public.shipment_access_grants (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid not null references public.profiles (id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shipment_id, profile_id)
);
create index shipment_access_grants_profile_idx on public.shipment_access_grants (profile_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (length(type) between 1 and 40),
  title text not null check (length(title) between 1 and 200),
  body text check (body is null or length(body) <= 1000),
  shipment_id uuid references public.shipments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.po_block_modification();

create table public.app_settings (
  key text primary key check (length(key) between 1 and 80),
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('organization_name', to_jsonb('Meine Organisation'::text), 'Name der Organisation (Etiketten, Empfangsbestätigung)'),
  ('pickup_code_ttl_hours', to_jsonb(72), 'Gültigkeit eines Abholcodes in Stunden (1-336)')
on conflict (key) do nothing;
