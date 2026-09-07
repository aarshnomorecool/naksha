import { supabase } from '@/lib/supabase'

// Shape mirrors supabase/migrations/0003_risk_scores.sql — top_factors is a
// heuristic stand-in for the real SHAP endpoint (`GET /explain/{id}`, not
// built yet). Keep this type in sync with that migration's comment, not with
// whatever the eventual FastAPI service happens to return.
export type RiskBand = 'on_track' | 'watching' | 'needs_attention'

export interface TopFactor {
  factor: string
  detail: string
  direction: 'positive' | 'negative'
}

// CLAUDE.md: dashboard badges stay support-framed ("Needs attention" /
// "Watching" / "On track"), never "High risk" / "Low risk" — this was a
// deliberate ethics choice, not a naming preference.
export const RISK_BAND_META: Record<RiskBand, { label: string; badgeClass: string; dot: string }> = {
  needs_attention: { label: 'Needs attention', badgeClass: 'bg-red-600 text-white', dot: '#ef4444' },
  watching: { label: 'Watching', badgeClass: 'bg-amber-500 text-white', dot: '#f59e0b' },
  on_track: { label: 'On track', badgeClass: 'bg-emerald-600 text-white', dot: '#22c55e' },
}

export interface StudentSummary {
  id: string
  roll_number: string
  full_name: string
  program: string
  year: number
  section: string | null
}

export interface RiskListRow {
  student_id: string
  risk_score: number
  risk_band: RiskBand
  top_factors: TopFactor[]
  student: StudentSummary
}

interface RiskScoreQueryRow {
  student_id: string
  risk_score: number
  risk_band: RiskBand
  top_factors: TopFactor[]
  students: StudentSummary | null
}

export async function fetchRiskList(): Promise<RiskListRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('risk_scores')
    .select('student_id, risk_score, risk_band, top_factors, students(id, roll_number, full_name, program, year, section)')
    .order('risk_score', { ascending: false })
    .returns<RiskScoreQueryRow[]>()
  if (error) throw error
  return (data ?? [])
    .filter((row): row is RiskScoreQueryRow & { students: StudentSummary } => row.students !== null)
    .map((row) => ({
      student_id: row.student_id,
      risk_score: row.risk_score,
      risk_band: row.risk_band,
      top_factors: row.top_factors,
      student: row.students,
    }))
}

export interface CheckIn {
  id: string
  session_date: string
  check_in_time: string
  method: string
  room_number: string
  building_name: string
}

export interface AttendanceDay {
  date: string
  present: boolean
}

export interface StudentDetail {
  student: StudentSummary
  risk: { risk_score: number; risk_band: RiskBand; top_factors: TopFactor[]; generated_at: string } | null
  checkIns: CheckIn[]
  attendanceTrend: AttendanceDay[]
}

interface AttendanceQueryRow {
  id: string
  session_date: string
  check_in_time: string
  method: string
  classrooms: { room_number: string; buildings: { name: string } | null } | null
}

export async function fetchStudentDetail(studentId: string): Promise<StudentDetail | null> {
  if (!supabase) return null

  const [studentRes, riskRes, attendanceRes] = await Promise.all([
    supabase.from('students').select('id, roll_number, full_name, program, year, section').eq('id', studentId).single<StudentSummary>(),
    supabase.from('risk_scores').select('risk_score, risk_band, top_factors, generated_at').eq('student_id', studentId).maybeSingle(),
    supabase
      .from('attendance')
      .select('id, session_date, check_in_time, method, classrooms(room_number, buildings(name))')
      .eq('student_id', studentId)
      .order('session_date', { ascending: false })
      .limit(30)
      .returns<AttendanceQueryRow[]>(),
  ])

  if (studentRes.error || !studentRes.data) return null
  if (attendanceRes.error) throw attendanceRes.error

  const checkIns: CheckIn[] = (attendanceRes.data ?? []).map((row) => ({
    id: row.id,
    session_date: row.session_date,
    check_in_time: row.check_in_time,
    method: row.method,
    room_number: row.classrooms?.room_number ?? '—',
    building_name: row.classrooms?.buildings?.name ?? '—',
  }))

  // Last 14 calendar days, present/absent — derived from the same check-in
  // rows above rather than a second query, since 30 rows already covers it.
  const presentDates = new Set(checkIns.map((c) => c.session_date))
  const attendanceTrend: AttendanceDay[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    attendanceTrend.push({ date: iso, present: presentDates.has(iso) })
  }

  return {
    student: studentRes.data,
    risk: riskRes.data ?? null,
    checkIns,
    attendanceTrend,
  }
}

export function recommendedActions(band: RiskBand): string[] {
  switch (band) {
    case 'needs_attention':
      return [
        'Schedule a 1:1 check-in this week',
        'Review recent attendance gaps together',
        'Flag to the academic advisor for follow-up',
      ]
    case 'watching':
      return [
        'Send a supportive check-in message',
        'Keep monitoring over the next two weeks',
      ]
    case 'on_track':
      return ['No action needed — positive reinforcement is enough']
  }
}
