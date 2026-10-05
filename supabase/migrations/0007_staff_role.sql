-- Staff-only access. Run after 0005 and 0006.
--
-- Until now every protected policy/function checked auth.role() =
-- 'authenticated' — i.e. "has any account". Supabase lets anyone sign up by
-- default, so a student could create an account and read every student's
-- data, mint check-in codes from home, or unlink a classmate's phone. Being
-- signed in is now not enough: the account must be listed in `staff`.
--
-- BEFORE RUNNING: open Authentication → Users and make sure every account
-- listed is yours (or a real mentor's). Every account that exists when this
-- runs is made staff, once. After that, add mentors explicitly:
--
--   insert into staff (user_id)
--   select id from auth.users where email = 'mentor@example.com';
--
-- Also turn off new sign-ups: Authentication → Sign In / Providers → disable
-- "Allow new users to sign up". Create mentor accounts with "Add user"
-- instead, then run the insert above.

create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table staff enable row level security;
-- No policies: the table is only read through is_staff() below.

insert into staff (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

revoke all on function is_staff() from public;
grant execute on function is_staff() to anon, authenticated;

-- ── Replace every "any signed-in account" policy ─────────────────────────
drop policy if exists "bus_positions_authenticated_write" on bus_positions;
create policy "bus_positions_staff_write" on bus_positions
  for insert with check (is_staff());

drop policy if exists "parking_spots_authenticated_write" on parking_spots;
create policy "parking_spots_staff_write" on parking_spots
  for update using (is_staff()) with check (is_staff());

drop policy if exists "students_authenticated_read" on students;
drop policy if exists "students_authenticated_write" on students;
drop policy if exists "students_authenticated_update" on students;
create policy "students_staff_read" on students for select using (is_staff());
create policy "students_staff_insert" on students for insert with check (is_staff());
create policy "students_staff_update" on students for update using (is_staff()) with check (is_staff());

drop policy if exists "attendance_authenticated_read" on attendance;
drop policy if exists "attendance_authenticated_write" on attendance;
create policy "attendance_staff_read" on attendance for select using (is_staff());
create policy "attendance_staff_insert" on attendance for insert with check (is_staff());

drop policy if exists "risk_scores_authenticated_read" on risk_scores;
create policy "risk_scores_staff_read" on risk_scores for select using (is_staff());

drop policy if exists "student_devices_authenticated_read" on student_devices;
create policy "student_devices_staff_read" on student_devices for select using (is_staff());

-- ── Staff-only functions from 0005 ───────────────────────────────────────
create or replace function issue_checkin_token(p_classroom_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '90 seconds';
begin
  if not is_staff() then
    raise exception 'Only staff can show check-in codes';
  end if;
  if not exists (select 1 from classrooms where id = p_classroom_id) then
    raise exception 'Unknown classroom';
  end if;

  delete from checkin_tokens where expires_at < now() - interval '10 minutes';

  insert into checkin_tokens (token, classroom_id, expires_at)
  values (v_token, p_classroom_id, v_expires);

  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function reset_student_device(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Only staff can reset a linked phone';
  end if;
  delete from student_devices where student_id = p_student_id;
end;
$$;
