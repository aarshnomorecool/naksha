-- Sample data for a fictional campus, seeded directly via SQL — NOT through a
-- real QR check-in flow, per CLAUDE.md's Week 1 scope ("seed Supabase directly
-- with sample data instead of building the input side"). Coordinates are a
-- small fictional layout near Nagpur; footprints are placeholder rectangles,
-- not digitized satellite tracing (see map-demo/campus-map-demo.html).
--
-- Run after 0001_schema.sql and 0002_rls.sql. Safe to re-run against a fresh
-- database only — it does not upsert/guard against duplicates.

-- ── Buildings ────────────────────────────────────────────────────────────
insert into buildings (name, footprint, height_m) values
  ('Main Academic Block',    ST_MakeEnvelope(79.08682, 21.14646, 79.08718, 21.14674, 4326), 14),
  ('Library',                ST_MakeEnvelope(79.08802, 21.14646, 79.08838, 21.14674, 4326), 14),
  ('Computer Science Block', ST_MakeEnvelope(79.08922, 21.14646, 79.08958, 21.14674, 4326), 14),
  ('Administration Block',   ST_MakeEnvelope(79.08682, 21.14486, 79.08718, 21.14514, 4326), 14),
  ('Cafeteria',              ST_MakeEnvelope(79.08802, 21.14486, 79.08838, 21.14514, 4326), 14),
  ('Hostel Block',           ST_MakeEnvelope(79.08922, 21.14486, 79.08958, 21.14514, 4326), 14);

-- ── Classrooms ───────────────────────────────────────────────────────────
-- Only academic buildings get classrooms — Administration/Cafeteria/Hostel
-- are map-visible buildings but not attendance/occupancy sources.
insert into classrooms (building_id, room_number, floor, capacity, location) values
  ((select id from buildings where name = 'Main Academic Block'), '101', 1, 70, ST_SetSRID(ST_MakePoint(79.08688, 21.14650), 4326)),
  ((select id from buildings where name = 'Main Academic Block'), '102', 1, 70, ST_SetSRID(ST_MakePoint(79.08694, 21.14650), 4326)),
  ((select id from buildings where name = 'Main Academic Block'), '103', 1, 60, ST_SetSRID(ST_MakePoint(79.08700, 21.14650), 4326)),
  ((select id from buildings where name = 'Main Academic Block'), '201', 2, 65, ST_SetSRID(ST_MakePoint(79.08690, 21.14668), 4326)),
  ((select id from buildings where name = 'Main Academic Block'), '202', 2, 65, ST_SetSRID(ST_MakePoint(79.08706, 21.14668), 4326)),
  ((select id from buildings where name = 'Computer Science Block'), 'CS-101',  1, 40, ST_SetSRID(ST_MakePoint(79.08928, 21.14650), 4326)),
  ((select id from buildings where name = 'Computer Science Block'), 'CS-102',  1, 40, ST_SetSRID(ST_MakePoint(79.08934, 21.14650), 4326)),
  ((select id from buildings where name = 'Computer Science Block'), 'CS-201',  2, 45, ST_SetSRID(ST_MakePoint(79.08940, 21.14650), 4326)),
  ((select id from buildings where name = 'Computer Science Block'), 'CS-Lab-1', 1, 35, ST_SetSRID(ST_MakePoint(79.08930, 21.14668), 4326)),
  ((select id from buildings where name = 'Computer Science Block'), 'CS-Lab-2', 2, 35, ST_SetSRID(ST_MakePoint(79.08946, 21.14668), 4326)),
  ((select id from buildings where name = 'Library'), 'Reading Hall',      1, 100, ST_SetSRID(ST_MakePoint(79.08808, 21.14656), 4326)),
  ((select id from buildings where name = 'Library'), 'Reference Section', 1, 50,  ST_SetSRID(ST_MakePoint(79.08820, 21.14656), 4326)),
  ((select id from buildings where name = 'Library'), 'Digital Library',   2, 40,  ST_SetSRID(ST_MakePoint(79.08832, 21.14656), 4326));

-- ── Students (40, synthetic names — not real students) ──────────────────
with name_pool as (
  select unnest(array[
    'Aarav Sharma','Vivaan Gupta','Aditya Verma','Vihaan Singh','Arjun Patel',
    'Sai Reddy','Reyansh Nair','Krishna Iyer','Ishaan Rao','Kabir Menon',
    'Ananya Joshi','Diya Kulkarni','Isha Deshmukh','Aadhya Kelkar','Myra Patil',
    'Saanvi Bhosale','Anika Chavan','Riya Jadhav','Navya Pawar','Prisha Shinde',
    'Rohan Kale','Kunal Thakur','Yash Mishra','Aryan Pandey','Devansh Tiwari',
    'Pranav Yadav','Nikhil Chauhan','Karan Rathore','Siddharth Bhatt','Om Trivedi',
    'Sneha Kapoor','Priya Malhotra','Kavya Bakshi','Tanvi Sethi','Meera Chopra',
    'Neha Saxena','Pooja Agarwal','Ritika Bansal','Simran Kohli','Anjali Dutta'
  ]) as full_name
), numbered as (
  select row_number() over () as rn, full_name from name_pool
)
insert into students (roll_number, full_name, program, year, section, email)
select
  'NKS25' || lpad(rn::text, 3, '0'),
  full_name,
  (array['B.Tech CSE', 'B.Tech AI&DS', 'B.Tech IT'])[1 + ((rn - 1) % 3)],
  1 + ((rn - 1) % 4),
  (array['A', 'B'])[1 + ((rn - 1) % 2)],
  lower(replace(full_name, ' ', '.')) || '@naksha-demo.edu'
from numbered;

-- ── Attendance ───────────────────────────────────────────────────────────
-- ~75% of students checked in today, to a random classroom, method 'manual'
-- since this was seeded directly rather than scanned via QR.
insert into attendance (student_id, classroom_id, session_date, check_in_time, method)
select
  s.id,
  (select id from classrooms order by random() limit 1),
  current_date,
  now() - (random() * interval '2 hours'),
  'manual'
from students s
where random() < 0.75;

-- ── Buses ────────────────────────────────────────────────────────────────
insert into buses (label, route_name) values
  ('Bus 1', 'Route 1 - Hostel Loop'),
  ('Bus 2', 'Route 2 - City Gate Shuttle'),
  ('Bus 3', 'Route 3 - North Campus Express');

insert into bus_positions (bus_id, position, heading, speed_kmh) values
  ((select id from buses where label = 'Bus 1'), ST_SetSRID(ST_MakePoint(79.08750, 21.14400), 4326), 45, 22),
  ((select id from buses where label = 'Bus 2'), ST_SetSRID(ST_MakePoint(79.09000, 21.14450), 4326), 180, 28),
  ((select id from buses where label = 'Bus 3'), ST_SetSRID(ST_MakePoint(79.08600, 21.14550), 4326), 270, 18);

-- ── Parking spots ────────────────────────────────────────────────────────
-- Lot A - Main Gate (10 bays)
insert into parking_spots (lot_name, location, capacity, occupied) values
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08760, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08773, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08786, 21.14430), 4326), 1, 0),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08799, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08812, 21.14430), 4326), 1, 0),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08825, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08838, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08851, 21.14430), 4326), 1, 0),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08864, 21.14430), 4326), 1, 1),
  ('Lot A - Main Gate', ST_SetSRID(ST_MakePoint(79.08877, 21.14430), 4326), 1, 0);

-- Lot B - Faculty (6 bays)
insert into parking_spots (lot_name, location, capacity, occupied) values
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08655, 21.14480), 4326), 1, 1),
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08655, 21.14490), 4326), 1, 1),
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08655, 21.14500), 4326), 1, 0),
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08665, 21.14480), 4326), 1, 1),
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08665, 21.14490), 4326), 1, 0),
  ('Lot B - Faculty', ST_SetSRID(ST_MakePoint(79.08665, 21.14500), 4326), 1, 0);
