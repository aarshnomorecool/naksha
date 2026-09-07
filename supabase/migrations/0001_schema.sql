-- NAKSHA core schema: campus map data + attendance
-- Postgres 15+ (Supabase default). gen_random_uuid() is built into core, no extension needed.

create extension if not exists postgis;

-- Generic "touch updated_at" trigger, reused by any table that has the column.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── Buildings ────────────────────────────────────────────────────────────
-- footprint is a placeholder rectangle until real footprints are hand-digitized
-- in QGIS/geojson.io (see map-demo/campus-map-demo.html for the same caveat).
create table buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  footprint geometry(Polygon, 4326) not null,
  height_m numeric not null default 14,
  created_at timestamptz not null default now()
);

-- ── Classrooms ───────────────────────────────────────────────────────────
-- current_occupancy is a maintained aggregate (see trigger below), never a
-- per-student record — this is what the public map layer is allowed to read.
create table classrooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  room_number text not null,
  floor int not null default 1,
  capacity int not null check (capacity > 0),
  location geometry(Point, 4326) not null,
  -- generated so the frontend can select plain lng/lat instead of dealing
  -- with PostgREST returning raw geometry as WKB hex
  lng double precision generated always as (ST_X(location)) stored,
  lat double precision generated always as (ST_Y(location)) stored,
  current_occupancy int not null default 0,
  created_at timestamptz not null default now(),
  unique (building_id, room_number)
);

-- ── Students ─────────────────────────────────────────────────────────────
-- Deliberately no gender/caste/religion/race columns: CLAUDE.md bans these as
-- model features, and the simplest way to guarantee that is to never collect
-- them here in the first place.
create table students (
  id uuid primary key default gen_random_uuid(),
  roll_number text not null unique,
  full_name text not null,
  program text not null,
  year int not null check (year between 1 and 4),
  section text,
  email text unique,
  created_at timestamptz not null default now()
);

-- ── Attendance ───────────────────────────────────────────────────────────
-- One row per check-in event. This is the single source of truth that both
-- feeds classroom occupancy (via the trigger below) and will later feed the
-- risk model's engagement feature — per CLAUDE.md, don't duplicate this path.
create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  session_date date not null default current_date,
  check_in_time timestamptz not null default now(),
  method text not null default 'manual' check (method in ('qr', 'manual', 'erp_import')),
  created_at timestamptz not null default now()
);
create index attendance_classroom_session_idx on attendance (classroom_id, session_date);
create index attendance_student_idx on attendance (student_id);

-- Keep classrooms.current_occupancy in sync with today's attendance rows.
-- security definer so it can update classrooms even though anon/authenticated
-- have no direct UPDATE grant on that table (only the public SELECT policy).
create or replace function sync_classroom_occupancy()
returns trigger as $$
declare
  affected_classroom uuid := coalesce(new.classroom_id, old.classroom_id);
begin
  update classrooms
  set current_occupancy = (
    select count(*) from attendance
    where classroom_id = affected_classroom
      and session_date = current_date
  )
  where id = affected_classroom;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger attendance_sync_occupancy
after insert or update or delete on attendance
for each row execute function sync_classroom_occupancy();

-- ── Buses ────────────────────────────────────────────────────────────────
create table buses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  route_name text not null,
  created_at timestamptz not null default now()
);

-- ── Bus positions ────────────────────────────────────────────────────────
-- Append-only log written by the driver's browser (Geolocation API). Current
-- position = latest row per bus, see current_bus_positions view below.
create table bus_positions (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  position geometry(Point, 4326) not null,
  -- generated + stored (not just a view) so Realtime's postgres_changes
  -- payload includes plain lng/lat directly — Realtime ships the raw
  -- physical row, and generated STORED columns are part of that, so the
  -- frontend never has to parse WKB/EWKB out of `position` itself.
  lng double precision generated always as (ST_X(position)) stored,
  lat double precision generated always as (ST_Y(position)) stored,
  heading numeric,
  speed_kmh numeric,
  recorded_at timestamptz not null default now()
);
create index bus_positions_bus_recorded_idx on bus_positions (bus_id, recorded_at desc);

-- bus_positions is fully public-read (see RLS migration), so this view needs
-- no special ownership tricks — it's just a convenience query.
create or replace view current_bus_positions as
select distinct on (bp.bus_id)
  bp.bus_id,
  b.label,
  b.route_name,
  bp.lng,
  bp.lat,
  bp.heading,
  bp.speed_kmh,
  bp.recorded_at
from bus_positions bp
join buses b on b.id = bp.bus_id
order by bp.bus_id, bp.recorded_at desc;

-- ── Parking spots ────────────────────────────────────────────────────────
-- One row per bay (capacity 1) rather than per lot, so the map can render
-- individual free/occupied markers the way CLAUDE.md describes.
create table parking_spots (
  id uuid primary key default gen_random_uuid(),
  lot_name text not null,
  location geometry(Point, 4326) not null,
  lng double precision generated always as (ST_X(location)) stored,
  lat double precision generated always as (ST_Y(location)) stored,
  capacity int not null default 1 check (capacity > 0),
  occupied int not null default 0 check (occupied >= 0 and occupied <= capacity),
  updated_at timestamptz not null default now()
);
create trigger parking_spots_touch_updated_at
before update on parking_spots
for each row execute function set_updated_at();
