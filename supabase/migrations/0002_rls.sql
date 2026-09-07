-- Row Level Security policies.
--
-- Split per CLAUDE.md's ethics framing: buildings/classrooms/buses/bus_positions/
-- parking_spots are the live-map layer (aggregate/operational, non-sensitive) and
-- are public-readable. students/attendance are the sensitive tables — DPDP-relevant
-- personal data — and require an authenticated session for any access.
--
-- classrooms.current_occupancy is safe to expose publicly even though it's
-- derived from attendance, because it's a maintained aggregate count (see the
-- sync_classroom_occupancy trigger in 0001_schema.sql) — the underlying
-- per-student attendance rows stay behind the authenticated-only policy below.

alter table buildings enable row level security;
alter table classrooms enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table buses enable row level security;
alter table bus_positions enable row level security;
alter table parking_spots enable row level security;

-- Public live-map data: read for everyone, no anon writes (writes come from
-- authenticated drivers/kiosks or the service role, none of which are built yet).
create policy "buildings_public_read" on buildings
  for select using (true);

create policy "classrooms_public_read" on classrooms
  for select using (true);

create policy "buses_public_read" on buses
  for select using (true);

create policy "bus_positions_public_read" on bus_positions
  for select using (true);

create policy "bus_positions_authenticated_write" on bus_positions
  for insert with check (auth.role() = 'authenticated');

create policy "parking_spots_public_read" on parking_spots
  for select using (true);

create policy "parking_spots_authenticated_write" on parking_spots
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Sensitive data: no anon access at all.
create policy "students_authenticated_read" on students
  for select using (auth.role() = 'authenticated');

create policy "students_authenticated_write" on students
  for insert with check (auth.role() = 'authenticated');

create policy "attendance_authenticated_read" on attendance
  for select using (auth.role() = 'authenticated');

create policy "attendance_authenticated_write" on attendance
  for insert with check (auth.role() = 'authenticated');
