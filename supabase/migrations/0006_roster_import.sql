-- Real roster import (mentor uploads a CSV, e.g. a Google Form export).
--
-- * is_demo separates the fabricated seed.sql students from real ones, so the
--   demo rows can be filtered out or removed later without guessing. Every
--   row that exists when this migration runs came from seed.sql (there was no
--   import path before this), so they're marked demo once here.
-- * consent_at / consent_source record when and how each real student agreed
--   to have their data used (DPDP). The import page refuses rows without it.
-- * students had no UPDATE policy, so re-importing a corrected file couldn't
--   fix existing rows; mentors get update rights alongside the existing
--   authenticated insert/read policies from 0002_rls.sql.

alter table students add column if not exists is_demo boolean not null default false;
alter table students add column if not exists consent_at timestamptz;
alter table students add column if not exists consent_source text;

update students set is_demo = true where consent_at is null and is_demo = false;

drop policy if exists "students_authenticated_update" on students;
create policy "students_authenticated_update" on students
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
