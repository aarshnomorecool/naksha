-- Phone binding + rotating check-in codes for student self-check-in.
--
-- Replaces 0004's self_check_in(roll, classroom), which had three holes once
-- real students use it:
--   1. any phone could check in any roll number (proxy attendance),
--   2. the classroom QR never changed, so a photo of it worked from anywhere,
--   3. roll_number was matched with ILIKE, so typing "NKS%" checked in
--      whichever student matched the wildcard first.
--
-- Now:
--   * The teacher's screen calls issue_checkin_token() every ~20s; the QR
--     encodes that short-lived token, and the classroom comes from the token,
--     never from the URL.
--   * A phone sends a random device id (kept in its browser storage). The
--     first check-in links that phone to one roll number; afterwards the phone
--     can only ever check in that student, and that student can't be claimed
--     from a second phone. A mentor can unlink via reset_student_device().
--   * Roll numbers match exactly (case-insensitive), no wildcards.
--
-- Apply after 0004 in the Supabase SQL editor.

-- ── One phone per student, one student per phone ─────────────────────────
create table if not exists student_devices (
  device_id uuid primary key,
  student_id uuid not null unique references students(id) on delete cascade,
  bound_at timestamptz not null default now()
);
alter table student_devices enable row level security;

-- Mentors can see whether/when a student's phone was linked. Writes only
-- happen through the security-definer functions below.
drop policy if exists "student_devices_authenticated_read" on student_devices;
create policy "student_devices_authenticated_read" on student_devices
  for select using (auth.role() = 'authenticated');

-- device_id is the only thing self_check_in uses to recognise a linked phone,
-- so anyone who can read it can check that student in. Nobody reads it over
-- the API — not even staff; the dashboard only needs student_id + bound_at.
revoke select on student_devices from anon, authenticated;
grant select (student_id, bound_at) on student_devices to authenticated;

-- ── Short-lived codes shown on the teacher's screen ──────────────────────
-- No policies at all: only reachable through the functions below.
create table if not exists checkin_tokens (
  token text primary key,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists checkin_tokens_expires_idx on checkin_tokens (expires_at);
alter table checkin_tokens enable row level security;

-- Valid for 90s while the screen refreshes every ~20s, so a student who scans
-- just before a refresh still has time to type their roll number on first use.
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
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Only signed-in staff can show check-in codes';
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

-- ── Student check-in ──────────────────────────────────────────────────────
drop function if exists self_check_in(text, uuid);

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

  -- Already-linked phone: it can only ever check in its own student.
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
      -- Lost a race with another phone claiming the same roll number.
      return jsonb_build_object('ok', false, 'status', 'roll_linked_elsewhere');
    end;
  end if;

  insert into attendance (student_id, classroom_id, method)
  values (v_student_id, v_classroom_id, 'qr')
  on conflict (student_id, classroom_id, session_date) do nothing;

  v_status := case when found then 'checked_in' else 'already_checked_in' end;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'roll_number', v_roll,
    'full_name', v_name,
    'classroom_id', v_classroom_id,
    'room_number', v_room,
    'building_name', v_building
  );
end;
$$;

-- ── Mentor: unlink a student's phone (new phone, cleared browser, etc.) ───
create or replace function reset_student_device(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Only signed-in staff can reset a linked phone';
  end if;
  delete from student_devices where student_id = p_student_id;
end;
$$;

revoke all on function issue_checkin_token(uuid) from public;
revoke all on function self_check_in(text, uuid, text) from public;
revoke all on function reset_student_device(uuid) from public;

grant execute on function issue_checkin_token(uuid) to authenticated;
grant execute on function self_check_in(text, uuid, text) to anon, authenticated;
grant execute on function reset_student_device(uuid) to authenticated;
