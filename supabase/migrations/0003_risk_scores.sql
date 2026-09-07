-- Risk scores: written by the ML service's `/score-batch` job (CLAUDE.md
-- build order step 4 — XGBoost + SHAP). That model doesn't exist yet, so
-- until it does, this table is populated by supabase/seed_risk.sql with
-- scores derived heuristically from real seeded attendance history — never
-- presented as real model output (see the seed file's own comments and the
-- dashboard's "Placeholder scores" banner).
--
-- One row per student (latest score only) rather than a history log, since
-- the dashboard only ever needs "the current score" — score history, if
-- wanted later, is a separate concern from this table.
create table risk_scores (
  student_id uuid primary key references students(id) on delete cascade,
  risk_score int not null check (risk_score between 0 and 100),
  risk_band text not null check (risk_band in ('on_track', 'watching', 'needs_attention')),
  -- Array of {factor, detail, direction}. Shape mirrors what the real SHAP
  -- endpoint (`GET /explain/{student_id}`) will eventually return, so the
  -- dashboard code doesn't need to change when that swap happens.
  top_factors jsonb not null default '[]',
  generated_at timestamptz not null default now()
);

alter table risk_scores enable row level security;

-- Same sensitivity class as students/attendance (DPDP-relevant) — no anon
-- access. Writes come from the ML service via the service_role key, which
-- bypasses RLS entirely, so no insert/update policy is needed here.
create policy "risk_scores_authenticated_read" on risk_scores
  for select using (auth.role() = 'authenticated');
