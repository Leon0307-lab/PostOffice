-- =====================================================================
-- PostOffice - Migration 3: Row Level Security, Grants, Storage
-- Grundsatz: alles ist verboten, was nicht ausdrücklich erlaubt wird.
-- Schreibzugriffe auf Sendungsdaten laufen ausschließlich über die
-- SECURITY-DEFINER-Funktionen aus Migration 2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Alle Standardrechte entziehen (Supabase vergibt sie sonst großzügig)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) RLS aktivieren (auch auf internen Tabellen)
-- ---------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.shipment_counters enable row level security;
alter table public.shipments enable row level security;
alter table public.status_transitions enable row level security;
alter table public.shipment_events enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.delivery_routes enable row level security;
alter table public.delivery_route_stops enable row level security;
alter table public.signatures enable row level security;
alter table public.documents enable row level security;
alter table public.shipment_photos enable row level security;
alter table public.pickup_codes enable row level security;
alter table public.shipment_access_grants enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- shipment_counters: keine Policies, keine Grants -> nur über security-definer-Funktion.

-- ---------------------------------------------------------------------
-- 3) Grants (Spaltenrechte wo nötig) + Policies
-- ---------------------------------------------------------------------

-- profiles ------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.po_is_staff()
  or (public.po_current_role() = 'abteilungsleiter'
      and department_id is not null
      and department_id = public.po_current_department())
);
-- Eigener Name darf geändert werden. Rolle/Abteilung/Aktivstatus: nur über Admin-Server (service role),
-- zusätzlich durch fehlende Column-Grants gesperrt.
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and is_active)
  with check (id = auth.uid());

-- Namensverzeichnis
grant select on public.directory to authenticated;

-- departments / locations ----------------------------------------------
grant select on public.departments to authenticated;
grant insert, update, delete on public.departments to authenticated;
create policy departments_select on public.departments for select to authenticated
  using (public.po_current_role() is not null);
create policy departments_admin_write on public.departments for all to authenticated
  using (public.po_is_admin()) with check (public.po_is_admin());

grant select on public.locations to authenticated;
grant insert, update, delete on public.locations to authenticated;
create policy locations_select on public.locations for select to authenticated
  using (public.po_current_role() is not null);
create policy locations_staff_write on public.locations for all to authenticated
  using (public.po_is_staff()) with check (public.po_is_staff());

-- status_transitions (lesbar für UI-Hinweise) ----------------------------
grant select on public.status_transitions to authenticated;
create policy status_transitions_select on public.status_transitions for select to authenticated
  using (public.po_current_role() is not null);

-- shipments -----------------------------------------------------------
-- Kein INSERT/DELETE für Clients. UPDATE nur auf unkritische Stammfelder.
grant select on public.shipments to authenticated;
grant update (
  sender_name, recipient_name, recipient_department_id, location_id,
  shipment_type, shipping_method, priority, subject, description, confidential
) on public.shipments to authenticated;

create policy shipments_select on public.shipments for select to authenticated
  using (public.po_can_view_shipment(id));
create policy shipments_update_staff on public.shipments for update to authenticated
  using (public.po_is_staff()) with check (public.po_is_staff());

-- shipment_events (nur lesen; Schreiben ausschließlich via Funktionen) -----
grant select on public.shipment_events to authenticated;
create policy shipment_events_select on public.shipment_events for select to authenticated
  using (public.po_can_view_shipment(shipment_id));

-- delivery_assignments ---------------------------------------------------
grant select on public.delivery_assignments to authenticated;
create policy delivery_assignments_select on public.delivery_assignments for select to authenticated
  using (public.po_is_staff() or courier_id = auth.uid());

-- delivery_routes / stops --------------------------------------------------
grant select, insert, update, delete on public.delivery_routes to authenticated;
create policy delivery_routes_select on public.delivery_routes for select to authenticated
  using (public.po_is_staff() or courier_id = auth.uid());
create policy delivery_routes_staff_write on public.delivery_routes for all to authenticated
  using (public.po_is_staff()) with check (public.po_is_staff());

grant select, insert, update, delete on public.delivery_route_stops to authenticated;
create policy route_stops_select on public.delivery_route_stops for select to authenticated
  using (
    public.po_is_staff()
    or exists (select 1 from public.delivery_routes r
               where r.id = route_id and r.courier_id = auth.uid())
  );
create policy route_stops_staff_write on public.delivery_route_stops for all to authenticated
  using (public.po_is_staff()) with check (public.po_is_staff());

-- signatures / documents / photos (nur lesen) ---------------------------------
grant select on public.signatures to authenticated;
create policy signatures_select on public.signatures for select to authenticated
  using (public.po_can_view_shipment(shipment_id));

grant select on public.documents to authenticated;
create policy documents_select on public.documents for select to authenticated
  using (public.po_can_view_shipment(shipment_id));

grant select on public.shipment_photos to authenticated;
create policy shipment_photos_select on public.shipment_photos for select to authenticated
  using (public.po_can_view_shipment(shipment_id));

-- pickup_codes: Hash-Spalte bleibt für Clients unsichtbar --------------------
grant select (id, shipment_id, expires_at, used_at, used_by, created_by, created_at)
  on public.pickup_codes to authenticated;
create policy pickup_codes_select on public.pickup_codes for select to authenticated
  using (
    public.po_is_staff()
    or exists (select 1 from public.shipments s where s.id = shipment_id and s.recipient_id = auth.uid())
  );

-- shipment_access_grants -------------------------------------------------------
grant select on public.shipment_access_grants to authenticated;
create policy access_grants_select on public.shipment_access_grants for select to authenticated
  using (
    public.po_is_staff()
    or profile_id = auth.uid()
    or exists (select 1 from public.shipments s where s.id = shipment_id and s.created_by = auth.uid())
  );

-- notifications ------------------------------------------------------------------
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_logs: nur Administratoren lesen; schreiben nur Funktionen/Service-Role ----
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.po_is_admin());

-- app_settings ----------------------------------------------------------------------
grant select on public.app_settings to authenticated;
grant insert, update on public.app_settings to authenticated;
create policy app_settings_select on public.app_settings for select to authenticated
  using (public.po_current_role() is not null);
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (public.po_is_admin()) with check (public.po_is_admin());

-- ---------------------------------------------------------------------
-- 4) Funktionsrechte: nur ausdrücklich freigegebene RPCs für "authenticated"
-- ---------------------------------------------------------------------
grant execute on function public.po_current_role() to authenticated;
grant execute on function public.po_current_department() to authenticated;
grant execute on function public.po_is_staff() to authenticated;
grant execute on function public.po_is_admin() to authenticated;
grant execute on function public.po_can_view_shipment(uuid) to authenticated;
grant execute on function public.po_can_process_shipment(uuid) to authenticated;

grant execute on function public.po_create_shipment(
  text, uuid, uuid, text, uuid, uuid, public.shipment_type, public.shipping_method,
  public.shipment_direction, public.shipment_priority, text, text, boolean) to authenticated;
grant execute on function public.po_change_status(uuid, public.shipment_status, text, public.return_reason) to authenticated;
grant execute on function public.po_assign_shipment(uuid, uuid, text) to authenticated;
grant execute on function public.po_add_note(uuid, text) to authenticated;
grant execute on function public.po_archive_shipment(uuid) to authenticated;
grant execute on function public.po_create_pickup_code(uuid, text, timestamptz) to authenticated;
grant execute on function public.po_deliver_shipment(uuid, text, text, text, text) to authenticated;
grant execute on function public.po_grant_access(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.po_revoke_access(uuid) to authenticated;

grant execute on function public.po_dashboard_counts() to authenticated;
grant execute on function public.po_stats_series(text, integer) to authenticated;
grant execute on function public.po_stats_by_department() to authenticated;
grant execute on function public.po_stats_by_courier() to authenticated;
grant execute on function public.po_stats_rates() to authenticated;

-- Der Auth-Dienst legt über diesen Trigger das Profil an (Sicherheitsnetz, falls EXECUTE geprüft wird).
grant execute on function public.po_handle_new_user() to supabase_auth_admin;

-- Nicht freigegeben (bleiben intern): po_log_event, po_audit, po_notify, po_notify_staff,
-- po_require_active_user, po_status_label, po_next_shipment_number und alle Trigger-Funktionen.

-- Die Service-Role (nur Server, nie im Browser) benötigt vollen Zugriff.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- 5) Storage: private Buckets. KEINE Policies für anon/authenticated,
--    dadurch kein direkter Zugriff aus dem Browser. Dateien werden
--    ausschließlich vom Server nach Berechtigungsprüfung geliefert.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('signatures', 'signatures', false, 524288,  array['image/png']),
  ('receipts',   'receipts',   false, 5242880, array['application/pdf']),
  ('labels',     'labels',     false, 5242880, array['application/pdf']),
  ('photos',     'photos',     false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('documents',  'documents',  false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
