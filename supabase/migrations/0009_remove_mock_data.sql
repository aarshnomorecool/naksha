-- Remove every kind of mock data except marks. Run after 0008.
--
-- Policy from here on: the only generated data allowed is baseline MARKS for
-- real students. Removed here, and never generated again:
--   * the fabricated demo students from seed.sql (and, by cascade, their
--     attendance, marks, risk scores, linked phones and messages)
--   * mock attendance baselines for real students (0008 generated these)
--   * placeholder risk_scores (heuristic, never a real model)
--   * seeded parking spots and buses (no real feed exists for either)
-- Kept: buildings/classrooms (the campus layout the QR check-in needs) and
-- the XYZ placeholder timetable for real class groups, until mentors replace
-- it from the dashboard.

-- ── Fake people ───────────────────────────────────────────────────────────
-- seed.sql students are flagged is_demo (0006) and use @naksha-demo.edu
-- emails; match either so this works even if 0006 ran after re-seeding.
delete from students
where is_demo or email like '%@naksha-demo.edu';

-- ── Mock attendance and placeholder scores ────────────────────────────────
delete from attendance where is_mock;
delete from risk_scores;

-- ── Seeded map feeds with no real source ──────────────────────────────────
delete from parking_spots;
delete from bus_positions;
delete from buses;

-- ── Leftover mock timetables / exams for groups that no longer exist ──────
delete from timetable t
where t.is_mock
  and not exists (
    select 1 from students s
    where s.program = t.program and s.year = t.year
      and (t.section is null or s.section is not distinct from t.section)
  );

delete from exams e
where e.is_mock and not exists (select 1 from marks m where m.exam_id = e.id);

-- ── Attendance is measured from when a student was actually added ────────
-- tracking_since used to start 28 days early to cover the mock attendance;
-- with that gone, those weeks would count as absences. "Start fresh" resets
-- (tracking_since = later date) are kept as they are.
update students
set tracking_since = greatest(tracking_since, (created_at at time zone 'Asia/Kolkata')::date);
alter table students alter column tracking_since set default ((now() at time zone 'Asia/Kolkata')::date);

-- ── Occupancy reflects only real check-ins ────────────────────────────────
update classrooms c
set current_occupancy = (
  select count(distinct a.student_id) from attendance a
  where a.classroom_id = c.id and a.session_date = current_date
);

-- ── Baselines are marks-only from now on ──────────────────────────────────
-- Same signature as 0008 so the insert trigger keeps working; the attendance
-- flag is ignored.
create or replace function generate_mock_baseline(p_student_id uuid, p_with_attendance boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_base numeric;
  v_subject text;
  v_exam uuid;
begin
  select * into s from students where id = p_student_id;
  if not found or s.is_demo then
    return;
  end if;

  perform ensure_group_timetable(s.program, s.year, s.section);

  if exists (select 1 from marks where student_id = p_student_id and is_mock) then
    return;
  end if;

  -- One overall level per student plus a per-subject spread, so some
  -- subjects come out weaker than others.
  v_base := 0.45 + random() * 0.45;
  for v_subject in
    select distinct subject from timetable
    where program = s.program and year = s.year and (section is null or section is not distinct from s.section)
  loop
    select id into v_exam from exams
    where is_mock and name = 'Unit Test 1' and subject = v_subject
      and program = s.program and year = s.year and section is not distinct from s.section
    limit 1;
    if v_exam is null then
      insert into exams (name, subject, program, year, section, exam_date, max_marks, is_mock)
      values ('Unit Test 1', v_subject, s.program, s.year, s.section, v_today - 21, 100, true)
      returning id into v_exam;
    end if;
    insert into marks (exam_id, student_id, score, is_mock)
    values (v_exam, p_student_id, round(least(98, greatest(8, (v_base + (random() - 0.5) * 0.4) * 100))), true)
    on conflict (exam_id, student_id) do nothing;
  end loop;
end;
$$;

create or replace function students_mock_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_demo then
    perform generate_mock_baseline(new.id);
  end if;
  return null;
end;
$$;

revoke all on function generate_mock_baseline(uuid, boolean) from public, anon, authenticated;
revoke all on function students_mock_baseline() from public, anon, authenticated;

-- ── Today's occupancy, always current ─────────────────────────────────────
-- classrooms.current_occupancy is only recalculated when someone checks in,
-- so yesterday's count lingered on the map until the first check-in of the
-- day. This view counts today's distinct students on every read. It runs
-- with its owner's rights (bypassing attendance RLS) but returns only one
-- number per room — the same aggregate current_occupancy already exposes —
-- never who checked in.
create or replace view classroom_occupancy_today as
select c.id as classroom_id, count(distinct a.student_id)::int as present
from classrooms c
left join attendance a on a.classroom_id = c.id and a.session_date = current_date
group by c.id;

grant select on classroom_occupancy_today to anon, authenticated;
