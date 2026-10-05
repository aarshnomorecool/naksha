import { addDays, isoDow, toMinutes, type TimetableSlot } from '@/lib/timetable'

// Shared by the student's phone dashboard and the mentor's student page, so
// both always show the same numbers.
//
// A "session" is one timetable period on one date. It counts as expected once
// it has started (today's later periods aren't held against anyone yet) and
// only from the student's tracking_since date — so a reset never turns empty
// history into absences.

export interface AttendanceRecord {
  session_date: string
  timetable_id: string | null
  check_in_time: string
}

export interface MarkRecord {
  exam: string
  subject: string
  exam_date: string
  max_marks: number
  score: number
}

export interface Tally {
  attended: number
  expected: number
  pct: number | null
}

export interface DayStatus {
  date: string
  attended: number
  expected: number
}

function tally(attended: number, expected: number): Tally {
  return { attended, expected, pct: expected > 0 ? Math.round((100 * attended) / expected) : null }
}

export function expectedSessions(
  slots: TimetableSlot[],
  fromIso: string,
  todayIso: string,
  nowMinutes: number,
): { date: string; slot: TimetableSlot }[] {
  const out: { date: string; slot: TimetableSlot }[] = []
  for (let d = fromIso; d <= todayIso; d = addDays(d, 1)) {
    const dow = isoDow(d)
    for (const slot of slots) {
      if (slot.day_of_week !== dow) continue
      if (d === todayIso && nowMinutes < toMinutes(slot.starts_at)) continue
      out.push({ date: d, slot })
    }
  }
  return out
}

export interface AttendanceSummary {
  overall: Tally
  bySubject: (Tally & { subject: string })[]
  byDay: Map<string, DayStatus>
}

export function summarizeAttendance(
  slots: TimetableSlot[],
  records: AttendanceRecord[],
  fromIso: string,
  todayIso: string,
  nowMinutes: number,
): AttendanceSummary {
  const attendedKeys = new Set(records.filter((r) => r.timetable_id).map((r) => `${r.session_date}|${r.timetable_id}`))
  const sessions = expectedSessions(slots, fromIso, todayIso, nowMinutes)

  const subj = new Map<string, { attended: number; expected: number }>()
  const byDay = new Map<string, DayStatus>()
  let attended = 0
  for (const { date, slot } of sessions) {
    const hit = attendedKeys.has(`${date}|${slot.id}`)
    if (hit) attended++
    const s = subj.get(slot.subject) ?? { attended: 0, expected: 0 }
    s.expected++
    if (hit) s.attended++
    subj.set(slot.subject, s)
    const day = byDay.get(date) ?? { date, attended: 0, expected: 0 }
    day.expected++
    if (hit) day.attended++
    byDay.set(date, day)
  }

  return {
    overall: tally(attended, sessions.length),
    bySubject: [...subj]
      .map(([subject, t]) => ({ subject, ...tally(t.attended, t.expected) }))
      .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)),
    byDay,
  }
}

export interface SubjectMarks {
  subject: string
  exams: { exam: string; date: string; pct: number; score: number; max: number }[]
  latestPct: number
  deltaPct: number | null
}

export function summarizeMarks(marks: MarkRecord[]): SubjectMarks[] {
  const bySubject = new Map<string, MarkRecord[]>()
  for (const m of marks) bySubject.set(m.subject, [...(bySubject.get(m.subject) ?? []), m])
  return [...bySubject]
    .map(([subject, list]) => {
      const exams = [...list]
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
        .map((m) => ({
          exam: m.exam,
          date: m.exam_date,
          score: Number(m.score),
          max: Number(m.max_marks),
          pct: Math.round((100 * Number(m.score)) / Number(m.max_marks)),
        }))
      const latest = exams[exams.length - 1]
      const prev = exams[exams.length - 2]
      return { subject, exams, latestPct: latest.pct, deltaPct: prev ? latest.pct - prev.pct : null }
    })
    .sort((a, b) => a.subject.localeCompare(b.subject))
}

// Gentle, support-framed list: lowest attendance or latest score first.
export function subjectsToFocus(attendance: AttendanceSummary, marks: SubjectMarks[]): { subject: string; reason: string }[] {
  const items: { subject: string; reason: string; weight: number }[] = []
  for (const s of attendance.bySubject) {
    if (s.pct !== null && s.expected >= 3 && s.pct < 75) {
      items.push({ subject: s.subject, reason: `${s.pct}% attendance`, weight: 75 - s.pct })
    }
  }
  for (const m of marks) {
    if (m.latestPct < 50) {
      const existing = items.find((i) => i.subject === m.subject)
      const reason = `${m.latestPct}% in ${m.exams[m.exams.length - 1].exam}`
      if (existing) {
        existing.reason += `, ${reason}`
        existing.weight += 50 - m.latestPct
      } else {
        items.push({ subject: m.subject, reason, weight: 50 - m.latestPct })
      }
    }
  }
  return items.sort((a, b) => b.weight - a.weight).slice(0, 3)
}

export function startOfWeek(todayIso: string): string {
  return addDays(todayIso, -(isoDow(todayIso) - 1))
}

export function startOfMonth(todayIso: string): string {
  return `${todayIso.slice(0, 8)}01`
}
