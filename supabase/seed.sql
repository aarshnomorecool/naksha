-- Campus layout only: buildings and classrooms. No people, attendance,
-- parking or bus data is seeded — those come only from real use (QR
-- check-ins, roster imports). Footprints are placeholder rectangles near
-- Nagpur until the real campus is traced.
--
-- Run once after the migrations on a fresh database (not guarded against
-- duplicates).

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
