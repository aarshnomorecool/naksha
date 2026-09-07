-- Extends seed.sql with 14 days of attendance history + placeholder risk
-- scores, so the mentor dashboard (frontend) has real rows to read via
-- Supabase instead of client-side mock data — same reasoning as why buses/
-- parking/classrooms were seeded before their live wiring existed.
--
-- IMPORTANT: risk_score/risk_band/top_factors below are a heuristic stand-in,
-- NOT real XGBoost/SHAP output (CLAUDE.md build order step 4, not built yet).
-- The dashboard visibly labels these as placeholder for the same reason the
-- map labels its simulated feed — don't present it as a trained model result.
--
-- Safe to re-run any time (clears attendance/risk_scores first, so it's not
-- an additive seed like seed.sql — running it again just re-rolls the
-- placeholder data instead of doubling it).

delete from risk_scores;
delete from attendance;

-- ── Attendance history (14 days, including today) ───────────────────────
-- Each student gets a fixed attendance tendency, deterministic from
-- hashtext() on their id (not re-rolled per row), so some students
-- consistently under-attend across the whole window. Without this, every
-- student would average out to roughly the same rate and the risk scores
-- below would carry no signal. (An earlier version of this file derived the
-- per-student bias via a hex-string -> bit(24) cast trick that turned out to
-- produce near-binary values instead of a smooth spread — hashtext() is a
-- plain, unambiguous 32-bit hash with no such surprise.)
with student_bias as (
  select id,
    0.35 + ((abs(hashtext(id::text)) % 1000) / 1000.0) * 0.6 as attend_prob
  from students
),
days as (
  select generate_series(0, 13) as days_ago
)
insert into attendance (student_id, classroom_id, session_date, check_in_time, method)
select
  sb.id,
  (select id from classrooms order by random() limit 1),
  current_date - d.days_ago,
  (current_date - d.days_ago) + time '09:00' + (random() * interval '2 hours'),
  'manual'
from student_bias sb
cross join days d
where random() < sb.attend_prob;

-- ── Placeholder risk scores, derived from the 14-day attendance rate just seeded ──
with attendance_rate as (
  select s.id as student_id,
    coalesce(round(100.0 * count(a.id) / 14, 0), 0) as attendance_pct
  from students s
  left join attendance a
    on a.student_id = s.id and a.session_date >= current_date - 13
  group by s.id
),
scored as (
  select
    student_id,
    attendance_pct,
    least(100, greatest(0, round(100 - attendance_pct + (random() * 10 - 5))::int)) as risk_score
  from attendance_rate
)
insert into risk_scores (student_id, risk_score, risk_band, top_factors)
select
  student_id,
  risk_score,
  case
    when risk_score >= 60 then 'needs_attention'
    when risk_score >= 30 then 'watching'
    else 'on_track'
  end,
  jsonb_build_array(
    jsonb_build_object(
      'factor', 'Attendance rate',
      'detail', attendance_pct || '% present over the last 14 days',
      'direction', case when attendance_pct < 60 then 'negative' else 'positive' end
    ),
    jsonb_build_object(
      'factor', 'Check-in consistency',
      'detail', case when risk_score >= 60 then 'Frequent multi-day gaps between check-ins' else 'Regular check-in pattern' end,
      'direction', case when risk_score >= 60 then 'negative' else 'positive' end
    )
  )
from scored;
