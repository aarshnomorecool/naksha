-- Timetable, exams/marks, mock baselines, reset, student dashboard, messages.
-- Run after 0005, 0006 and 0007.
--
-- * timetable: per class group (program + year + section). A mock timetable
--   is generated for every group with teacher = 'XYZ' (placeholder — never a
--   real or invented name). Mentors edit slots from the dashboard; edited
--   slots stop being mock.
-- * attendance rows now record which timetable period they belong to
--   (stamped automatically from the classroom + India time), so attendance
--   can be counted per subject, and one student can check into several
--   periods in the same room on the same day.
-- * When a real (non-demo) student is added, a mock baseline is generated:
--   ~4 weeks of past weekday attendance from their group's timetable and one
--   'Unit Test 1' score per subject. Real check-ins and real exams then build
--   on top. is_mock is internal only — it's what "Clear baseline" removes.
-- * College hours are India time; the database clock is UTC, so every
--   "what period is it now" calculation converts to Asia/Kolkata explicitly.

-- ── Timetable ─────────────────────────────────────────────────────────────
create table if not exists timetable (
  id uuid primary key default gen_random_uuid(),
  program text not null,
  year int not null check (year between 1 and 4),
  section text,                         -- null = every section of that program/year
  day_of_week int not null check (day_of_week between 1 and 7),   -- ISO: 1 = Monday
  starts_at time not null,
  ends_at time not null,
  classroom_id uuid references classrooms(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) > 0),
  teacher text not null default 'XYZ',
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists timetable_room_day_idx on timetable (classroom_id, day_of_week);
create index if not exists timetable_group_idx on timetable (program, year, section);
alter table timetable enable row level security;

-- Room schedules aren't personal data: the public map and the scan page show
-- what's running in each room.
drop policy if exists "timetable_public_read" on timetable;
create policy "timetable_public_read" on timetable for select using (true);
drop policy if exists "timetable_staff_insert" on timetable;
create policy "timetable_staff_insert" on timetable for insert with check (is_staff());
drop policy if exists "timetable_staff_update" on timetable;
create policy "timetable_staff_update" on timetable for update using (is_staff()) with check (is_staff());
drop policy if exists "timetable_staff_delete" on timetable;
create policy "timetable_staff_delete" on timetable for delete using (is_staff());

create or replace function mock_subjects_for(p_program text)
returns text[]
language sql
immutable
as $$
  select case
    when p_program ~* '(cse|comput|\yit\y|informat|\yai|data|\yds\y|\yml\y)' then
      array['Data Structures', 'Operating Systems', 'Database Management', 'Computer Networks', 'Discrete Mathematics', 'Software Engineering']
    when p_program ~* '(ece|electronic|entc|e&tc|telecom)' then
      array['Signals and Systems', 'Digital Electronics', 'Analog Circuits', 'Microprocessors', 'Electromagnetics', 'Engineering Mathematics']
    when p_program ~* 'mech' then
      array['Thermodynamics', 'Fluid Mechanics', 'Strength of Materials', 'Machine Design', 'Manufacturing Processes', 'Engineering Mathematics']
    when p_program ~* 'civil' then
      array['Structural Analysis', 'Surveying', 'Concrete Technology', 'Geotechnical Engineering', 'Fluid Mechanics', 'Engineering Mathematics']
    when p_program ~* '(electrical|eee)' then
      array['Electrical Machines', 'Power Systems', 'Control Systems', 'Network Analysis', 'Power Electronics', 'Engineering Mathematics']
    else
      array['Engineering Mathematics', 'Applied Physics', 'Communication Skills', 'Programming Fundamentals', 'Engineering Graphics', 'Environmental Studies']
  end
$$;

-- Mon–Fri, six periods. Each group gets a home room; if another group already
-- has it in that period, the next free room is used, and if every room is
-- taken the slot is created without a room ("room to be assigned").
create or replace function ensure_group_timetable(p_program text, p_year int, p_section text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subjects text[] := mock_subjects_for(p_program);
  v_starts time[] := array['09:00', '10:00', '11:15', '12:15', '14:00', '15:00']::time[];
  v_ends time[] := array['10:00', '11:00', '12:15', '13:15', '15:00', '16:00']::time[];
  v_rooms uuid[];
  v_n int;
  v_seed int;
  v_home int;
  v_room uuid;
  v_candidate uuid;
begin
  if exists (
    select 1 from timetable
    where program = p_program and year = p_year and section is not distinct from p_section
  ) then
    return;
  end if;

  select array_agg(id order by room_number, id) into v_rooms from classrooms;
  v_n := coalesce(array_length(v_rooms, 1), 0);
  v_seed := abs(hashtext(p_program || '|' || p_year || '|' || coalesce(p_section, '')));
  v_home := case when v_n > 0 then v_seed % v_n else 0 end;

  for v_day in 1..5 loop
    for v_p in 1..6 loop
      v_room := null;
      for v_try in 0..greatest(v_n - 1, 0) loop
        exit when v_n = 0;
        v_candidate := v_rooms[1 + (v_home + v_try) % v_n];
        if not exists (
          select 1 from timetable
          where classroom_id = v_candidate and day_of_week = v_day and starts_at = v_starts[v_p]
        ) then
          v_room := v_candidate;
          exit;
        end if;
      end loop;

      insert into timetable (program, year, section, day_of_week, starts_at, ends_at, classroom_id, subject, teacher, is_mock)
      values (
        p_program, p_year, p_section, v_day, v_starts[v_p], v_ends[v_p], v_room,
        v_subjects[1 + ((v_seed + v_day * 2 + v_p) % array_length(v_subjects, 1))],
        'XYZ', true
      );
    end loop;
  end loop;
end;
$$;

-- The period running in a room at a given moment (India time), allowing
-- check-in from 10 minutes before the period starts.
create or replace function slot_at(p_classroom_id uuid, p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from timetable
  where classroom_id = p_classroom_id
    and day_of_week = extract(isodow from (p_at at time zone 'Asia/Kolkata'))::int
    and (p_at at time zone 'Asia/Kolkata')::time >= starts_at - interval '10 minutes'
    and (p_at at time zone 'Asia/Kolkata')::time < ends_at
  order by starts_at
  limit 1
$$;

-- ── Attendance: period-aware ──────────────────────────────────────────────
alter table attendance add column if not exists timetable_id uuid references timetable(id) on delete set null;
alter table attendance add column if not exists is_mock boolean not null default false;

-- Every insert path (phone, mentor manual entry, seeds) gets its period
-- stamped here, so nothing upstream has to know about the timetable.
create or replace function stamp_attendance_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.timetable_id is null then
    new.timetable_id := slot_at(new.classroom_id, new.check_in_time);
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_stamp_slot on attendance;
create trigger attendance_stamp_slot
before insert on attendance
for each row execute function stamp_attendance_slot();

-- 0004 allowed one row per (student, room, day). A section usually sits in
-- one room all day, so that blocked every period after the first. Now it's
-- one row per period; check-ins outside any period still dedupe per day.
drop index if exists attendance_one_per_day;
create unique index if not exists attendance_one_per_slot
  on attendance (student_id, classroom_id, session_date, (coalesce(timetable_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- Occupancy = distinct students in the room today (a student attending three
-- periods there is one person, not three).
create or replace function sync_classroom_occupancy()
returns trigger as $$
declare
  affected_classroom uuid := coalesce(new.classroom_id, old.classroom_id);
begin
  update classrooms
  set current_occupancy = (
    select count(distinct student_id) from attendance
    where classroom_id = affected_classroom
      and session_date = current_date
  )
  where id = affected_classroom;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

-- ── Exams and marks ───────────────────────────────────────────────────────
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  subject text not null check (char_length(btrim(subject)) > 0),
  program text not null,
  year int not null check (year between 1 and 4),
  section text,
  exam_date date not null default current_date,
  max_marks numeric not null check (max_marks > 0),
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists exams_group_idx on exams (program, year, section);

create table if not exists marks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score numeric not null check (score >= 0),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)
);
create index if not exists marks_student_idx on marks (student_id);

create or replace function check_mark_score()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
  select max_marks into v_max from exams where id = new.exam_id;
  if new.score > v_max then
    raise exception 'Score % is more than the exam maximum of %', new.score, v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists marks_check_score on marks;
create trigger marks_check_score
before insert or update on marks
for each row execute function check_mark_score();

alter table exams enable row level security;
alter table marks enable row level security;
drop policy if exists "exams_staff_all" on exams;
create policy "exams_staff_all" on exams for all using (is_staff()) with check (is_staff());
drop policy if exists "marks_staff_all" on marks;
create policy "marks_staff_all" on marks for all using (is_staff()) with check (is_staff());

-- ── Tracking window ───────────────────────────────────────────────────────
-- Attendance % is measured from tracking_since. "Clear baseline" moves it to
-- when the student was added; "Start fresh" moves it to today, so neither
-- leaves weeks of empty history counting as absences.
alter table students add column if not exists tracking_since date;
update students
set tracking_since = (created_at at time zone 'Asia/Kolkata')::date - 28
where tracking_since is null;
alter table students alter column tracking_since set default ((now() at time zone 'Asia/Kolkata')::date - 28);
alter table students alter column tracking_since set not null;

-- ── Mock baseline ─────────────────────────────────────────────────────────
create or replace function generate_mock_baseline(p_student_id uuid, p_with_attendance boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  slot record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_base numeric;
  v_rate jsonb := '{}'::jsonb;
  v_subject text;
  v_day date;
  v_exam uuid;
  v_r numeric;
begin
  select * into s from students where id = p_student_id;
  if not found then
    return;
  end if;

  perform ensure_group_timetable(s.program, s.year, s.section);

  if exists (select 1 from marks where student_id = p_student_id and is_mock)
    or exists (select 1 from attendance where student_id = p_student_id and is_mock)
  then
    return;
  end if;

  -- One overall tendency per student, then a per-subject spread so some
  -- subjects come out noticeably weaker than others.
  v_base := 0.55 + random() * 0.4;
  for v_subject in
    select distinct subject from timetable
    where program = s.program and year = s.year and (section is null or section is not distinct from s.section)
  loop
    v_rate := v_rate || jsonb_build_object(v_subject, least(0.98, greatest(0.25, v_base + (random() - 0.5) * 0.35)));
  end loop;

  if p_with_attendance then
    for v_day in select generate_series(v_today - 28, v_today - 1, interval '1 day')::date loop
      continue when extract(isodow from v_day) > 5;
      for slot in
        select * from timetable
        where program = s.program and year = s.year and (section is null or section is not distinct from s.section)
          and day_of_week = extract(isodow from v_day)::int
          and classroom_id is not null
      loop
        if random() < (v_rate ->> slot.subject)::numeric then
          insert into attendance (student_id, classroom_id, session_date, check_in_time, method, timetable_id, is_mock)
          values (
            p_student_id, slot.classroom_id, v_day,
            ((v_day + slot.starts_at) at time zone 'Asia/Kolkata') + random() * interval '8 minutes',
            'qr', slot.id, true
          )
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end if;

  for v_subject in select jsonb_object_keys(v_rate) loop
    select id into v_exam from exams
    where is_mock and name = 'Unit Test 1' and subject = v_subject
      and program = s.program and year = s.year and section is not distinct from s.section
    limit 1;
    if v_exam is null then
      insert into exams (name, subject, program, year, section, exam_date, max_marks, is_mock)
      values ('Unit Test 1', v_subject, s.program, s.year, s.section, v_today - 21, 100, true)
      returning id into v_exam;
    end if;
    v_r := (v_rate ->> v_subject)::numeric;
    insert into marks (exam_id, student_id, score, is_mock)
    values (v_exam, p_student_id, round(least(98, greatest(8, v_r * 85 + (random() - 0.5) * 30))), true)
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
    perform generate_mock_baseline(new.id, true);
  else
    perform ensure_group_timetable(new.program, new.year, new.section);
  end if;
  return null;
end;
$$;

drop trigger if exists students_after_insert_baseline on students;
create trigger students_after_insert_baseline
after insert on students
for each row execute function students_mock_baseline();

-- ── Backfill existing data ────────────────────────────────────────────────
do $$
declare
  g record;
  st record;
begin
  for g in select distinct program, year, section from students loop
    perform ensure_group_timetable(g.program, g.year, g.section);
  end loop;

  -- Existing rows predate period stamping; give them their period where the
  -- check-in time falls inside one. Uniqueness can't break: 0004 already
  -- allowed at most one row per (student, room, day).
  update attendance set timetable_id = slot_at(classroom_id, check_in_time) where timetable_id is null;

  -- Real students get the full baseline; demo students already have seeded
  -- attendance, so they only get baseline marks.
  for st in select id, is_demo from students loop
    perform generate_mock_baseline(st.id, not st.is_demo);
  end loop;
end;
$$;

-- ── Reset (staff) ─────────────────────────────────────────────────────────
create or replace function reset_student_data(p_student_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Only staff can reset a student''s data';
  end if;
  if p_mode = 'baseline' then
    delete from attendance where student_id = p_student_id and is_mock;
    delete from marks where student_id = p_student_id and is_mock;
    update students set tracking_since = (created_at at time zone 'Asia/Kolkata')::date where id = p_student_id;
  elsif p_mode = 'all' then
    delete from attendance where student_id = p_student_id;
    delete from marks where student_id = p_student_id;
    update students set tracking_since = (now() at time zone 'Asia/Kolkata')::date where id = p_student_id;
  else
    raise exception 'Unknown reset mode %', p_mode;
  end if;
end;
$$;

-- ── Messages to mentors ───────────────────────────────────────────────────
create table if not exists mentor_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists mentor_messages_student_idx on mentor_messages (student_id, created_at desc);
alter table mentor_messages enable row level security;
drop policy if exists "mentor_messages_staff_read" on mentor_messages;
create policy "mentor_messages_staff_read" on mentor_messages for select using (is_staff());
drop policy if exists "mentor_messages_staff_update" on mentor_messages;
create policy "mentor_messages_staff_update" on mentor_messages for update using (is_staff()) with check (is_staff());

create or replace function send_mentor_message(p_device_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select student_id into v_student from student_devices where device_id = p_device_id;
  if v_student is null then
    return jsonb_build_object('ok', false, 'status', 'not_linked');
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    return jsonb_build_object('ok', false, 'status', 'empty');
  end if;
  if char_length(p_body) > 1000 then
    return jsonb_build_object('ok', false, 'status', 'too_long');
  end if;
  if (select count(*) from mentor_messages where student_id = v_student and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'status', 'rate_limited');
  end if;
  insert into mentor_messages (student_id, body) values (v_student, btrim(p_body));
  return jsonb_build_object('ok', true, 'status', 'sent');
end;
$$;

-- ── Student dashboard (phone) ─────────────────────────────────────────────
-- Identified only by the linked phone's device id (see 0005). Returns that
-- one student's own data and nothing about anyone else.
create or replace function student_dashboard(p_device_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_since date;
begin
  select st.* into s
  from student_devices d
  join students st on st.id = d.student_id
  where d.device_id = p_device_id;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_linked');
  end if;

  v_since := greatest(s.tracking_since, v_today - 120);

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'tracking_since', v_since,
    'student', jsonb_build_object(
      'id', s.id, 'roll_number', s.roll_number, 'full_name', s.full_name,
      'program', s.program, 'year', s.year, 'section', s.section
    ),
    'timetable', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'day_of_week', t.day_of_week, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
        'subject', t.subject, 'teacher', t.teacher, 'room_number', c.room_number, 'building_name', b.name
      ) order by t.day_of_week, t.starts_at)
      from timetable t
      left join classrooms c on c.id = t.classroom_id
      left join buildings b on b.id = c.building_id
      where t.program = s.program and t.year = s.year and (t.section is null or t.section is not distinct from s.section)
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_date', a.session_date, 'check_in_time', a.check_in_time,
        'timetable_id', a.timetable_id, 'subject', t.subject, 'room_number', c.room_number
      ) order by a.check_in_time desc)
      from attendance a
      left join timetable t on t.id = a.timetable_id
      left join classrooms c on c.id = a.classroom_id
      where a.student_id = s.id and a.session_date >= v_since
    ), '[]'::jsonb),
    'marks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exam', e.name, 'subject', e.subject, 'exam_date', e.exam_date,
        'max_marks', e.max_marks, 'score', m.score
      ) order by e.exam_date, e.created_at)
      from marks m
      join exams e on e.id = m.exam_id
      where m.student_id = s.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('body', mm.body, 'created_at', mm.created_at, 'read_at', mm.read_at) order by mm.created_at desc)
      from (select * from mentor_messages where student_id = s.id order by created_at desc limit 10) mm
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Phone check-in: new uniqueness target + return the period ─────────────
create or replace function self_check_in(
  p_token text,
  p_device_id uuid,
  p_roll_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom_id uuid;
  v_student_id uuid;
  v_roll text;
  v_name text;
  v_room text;
  v_building text;
  v_status text;
  v_subject text;
  v_teacher text;
begin
  if p_device_id is null then
    return jsonb_build_object('ok', false, 'status', 'bad_device');
  end if;

  select t.classroom_id, c.room_number, b.name
    into v_classroom_id, v_room, v_building
  from checkin_tokens t
  join classrooms c on c.id = t.classroom_id
  left join buildings b on b.id = c.building_id
  where t.token = p_token and t.expires_at > now();

  if v_classroom_id is null then
    return jsonb_build_object('ok', false, 'status', 'expired_code');
  end if;

  select s.id, s.roll_number, s.full_name
    into v_student_id, v_roll, v_name
  from student_devices d
  join students s on s.id = d.student_id
  where d.device_id = p_device_id;

  if v_student_id is null then
    if p_roll_number is null or btrim(p_roll_number) = '' then
      return jsonb_build_object('ok', false, 'status', 'needs_roll_number',
        'room_number', v_room, 'building_name', v_building);
    end if;

    select id, roll_number, full_name
      into v_student_id, v_roll, v_name
    from students
    where upper(roll_number) = upper(btrim(p_roll_number));

    if v_student_id is null then
      return jsonb_build_object('ok', false, 'status', 'not_found');
    end if;

    if exists (select 1 from student_devices where student_id = v_student_id) then
      return jsonb_build_object('ok', false, 'status', 'roll_linked_elsewhere');
    end if;

    begin
      insert into student_devices (device_id, student_id) values (p_device_id, v_student_id);
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'status', 'roll_linked_elsewhere');
    end;
  end if;

  insert into attendance (student_id, classroom_id, method)
  values (v_student_id, v_classroom_id, 'qr')
  on conflict (student_id, classroom_id, session_date, (coalesce(timetable_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do nothing;

  v_status := case when found then 'checked_in' else 'already_checked_in' end;

  select subject, teacher into v_subject, v_teacher from timetable where id = slot_at(v_classroom_id, now());

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'roll_number', v_roll,
    'full_name', v_name,
    'classroom_id', v_classroom_id,
    'room_number', v_room,
    'building_name', v_building,
    'subject', v_subject,
    'teacher', v_teacher
  );
end;
$$;

-- ── Permissions ───────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon/authenticated directly
-- (not via PUBLIC), so internal helpers must be revoked from those roles by
-- name — otherwise anyone could call generate_mock_baseline() and inject
-- attendance for any student.
revoke all on function ensure_group_timetable(text, int, text) from public, anon, authenticated;
revoke all on function generate_mock_baseline(uuid, boolean) from public, anon, authenticated;
revoke all on function students_mock_baseline() from public, anon, authenticated;
revoke all on function stamp_attendance_slot() from public, anon, authenticated;
revoke all on function slot_at(uuid, timestamptz) from public, anon, authenticated;

revoke all on function reset_student_data(uuid, text) from public, anon;
grant execute on function reset_student_data(uuid, text) to authenticated;

revoke all on function send_mentor_message(uuid, text) from public;
grant execute on function send_mentor_message(uuid, text) to anon, authenticated;
revoke all on function student_dashboard(uuid) from public;
grant execute on function student_dashboard(uuid) to anon, authenticated;
revoke all on function self_check_in(text, uuid, text) from public;
grant execute on function self_check_in(text, uuid, text) to anon, authenticated;

-- Live updates for the mentor inbox and timetable edits.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mentor_messages') then
    alter publication supabase_realtime add table mentor_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'timetable') then
    alter publication supabase_realtime add table timetable;
  end if;
end;
$$;
