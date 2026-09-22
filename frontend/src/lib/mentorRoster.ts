import { supabase } from '@/lib/supabase'

// Live mentor roster: bands are derived from REAL attendance rows at read
// time, never from the risk_scores table (which is a one-time heuristic seed
// until the XGBoost+SHAP model lands — reading it is what caused stale
// "Needs attention" flags to survive deleted data).
//
// Band rule (documented, deterministic):
//   no check-in rows in the 14-day window -> 'no_data' (NOT flagged —
//     absence of data must never read as guilt)
//   attendance < 50%  -> 'needs_attention'
//   attendance < 75%  -> 'watching'
//   otherwise         -> 'on_track'

export const ROSTER_WINDOW_DAYS = 14

export type LiveBand = 'needs_attention' | 'watching' | 'on_track' | 'no_data'

export const LIVE_BAND_META: Record<LiveBand, { label: string; badgeClass: string; dot: string }> = {
  needs_attention: { label: 'Needs attention', badgeClass: 'bg-red-600 text-white', dot: '#ef4444' },
  watching: { label: 'Watching', badgeClass: 'bg-amber-500 text-white', dot: '#f59e0b' },
  on_track: { label: 'On track', badgeClass: 'bg-emerald-600 text-white', dot: '#22c55e' },
  no_data: { label: 'No data', badgeClass: 'bg-muted text-muted-foreground', dot: '#94a3b8' },
}

export interface RosterStudent {
  id: string
  roll_number: string
  full_name: string
  program: string
  year: number
  section: string | null
  presentDays: number
  attendancePct: number | null
  band: LiveBand
}

export function bandForAttendance(presentDays: number, hasData: boolean): { pct: number | null; band: LiveBand } {
  if (!hasData) return { pct: null, band: 'no_data' }
  const pct = Math.round((100 * presentDays) / ROSTER_WINDOW_DAYS)
  if (pct < 50) return { pct, band: 'needs_attention' }
  if (pct < 75) return { pct, band: 'watching' }
  return { pct, band: 'on_track' }
}

interface StudentRow {
  id: string
  roll_number: string
  full_name: string
  program: string
  year: number
  section: string | null
}

interface AttendanceRow {
  student_id: string
  session_date: string
}

export function windowStartIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - (ROSTER_WINDOW_DAYS - 1))
  return d.toISOString().slice(0, 10)
}

// One query for students, one for the window's attendance (distinct days per
// student counted client-side). ~40 students, so this stays tiny.
export async function fetchMentorRoster(): Promise<RosterStudent[]> {
  if (!supabase) return []
  const startIso = windowStartIso()
  const [studentsRes, attendanceRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, roll_number, full_name, program, year, section')
      .order('full_name')
      .returns<StudentRow[]>(),
    supabase
      .from('attendance')
      .select('student_id, session_date')
      .gte('session_date', startIso)
      .returns<AttendanceRow[]>(),
  ])
  if (studentsRes.error) throw studentsRes.error
  if (attendanceRes.error) throw attendanceRes.error

  const daysByStudent = new Map<string, Set<string>>()
  for (const row of attendanceRes.data ?? []) {
    let days = daysByStudent.get(row.student_id)
    if (!days) {
      days = new Set()
      daysByStudent.set(row.student_id, days)
    }
    days.add(row.session_date)
  }

  return (studentsRes.data ?? []).map((s) => {
    const days = daysByStudent.get(s.id)
    const { pct, band } = bandForAttendance(days?.size ?? 0, !!days && days.size > 0)
    return {
      id: s.id,
      roll_number: s.roll_number,
      full_name: s.full_name,
      program: s.program,
      year: s.year,
      section: s.section,
      presentDays: days?.size ?? 0,
      attendancePct: pct,
      band,
    }
  })
}
