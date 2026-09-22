-- Student self-check-in from a phone (QR link) + realtime safety net.
--
-- THE PROBLEM this solves: 0002_rls.sql keeps students/attendance behind
-- authenticated-only policies, but a student opening a QR link on their phone
-- is anonymous (no login). A direct anon INSERT/SELECT policy would let anyone
-- dump the student list or spam attendance rows, so instead this migration
-- opens exactly one narrow, server-side hole:
--
--   self_check_in(p_roll_number, p_classroom_id)
--
-- It resolves the roll number against students (case-insensitive, unique),
-- rejects unknown classrooms, dedupes one row per (student, classroom, day),
-- and stamps check_in_time/session_date from the database clock — the phone
-- never supplies identity or time, it only supplies a roll number to look up.
-- The existing sync_classroom_occupancy trigger (0001) then updates the map,
-- and the realtime grants below let the mentor dashboard watch it live.
--
-- Apply in the Supabase SQL editor (or `supabase db push`), then test:
--   select self_check_in('NKS25001', (select id from classrooms limit 1));

-- One row per (student, classroom, day) at the database level, so two phones
-- tapping "Check in" at the same second can't double-count occupancy. Safe
-- against existing seeds: seed.sql/seed_risk.sql never write two rows for the
-- same student + classroom + day (one draw per student per day).
create unique index if not exists attendance_one_per_day
  on attendance (student_id, classroom_id, session_date);

create or replace function self_check_in(p_roll_number text, p_classroom_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_roll text;
  v_name text;
  v_today date := current_date;
begin
  if p_roll_number is null or btrim(p_roll_number) = '' then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;

  if p_classroom_id is null
    or not exists (select 1 from classrooms where id = p_classroom_id)
  then
    return jsonb_build_object('ok', false, 'status', 'bad_classroom');
  end if;

  select id, roll_number, full_name
    into v_student_id, v_roll, v_name
  from students
  where roll_number ilike btrim(p_roll_number)
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;

  if exists (
    select 1 from attendance
    where student_id = v_student_id
      and classroom_id = p_classroom_id
      and session_date = v_today
  ) then
    return jsonb_build_object(
      'ok', true, 'status', 'already_checked_in',
      'roll_number', v_roll, 'full_name', v_name
    );
  end if;

  insert into attendance (student_id, classroom_id, method)
  values (v_student_id, p_classroom_id, 'qr');

  return jsonb_build_object(
    'ok', true, 'status', 'checked_in',
    'roll_number', v_roll, 'full_name', v_name
  );
exception when unique_violation then
  -- Lost a race with another check-in for the same row: still a success.
  return jsonb_build_object(
    'ok', true, 'status', 'already_checked_in',
    'roll_number', v_roll, 'full_name', v_name
  );
end;
$$;

-- Narrow grant: anyone (even anon) may CALL the function, but the function
-- runs as its owner and only does what its body says. No direct anon access
-- to students/attendance is granted anywhere in this file.
revoke all on function self_check_in(text, uuid) from public;
grant execute on function self_check_in(text, uuid) to anon, authenticated;

-- Let authenticated mentor clients watch live check-ins/occupancy without a
-- refresh: no-ops if the tables are already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table attendance;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classrooms'
  ) then
    alter publication supabase_realtime add table classrooms;
  end if;
end;
$$;
