import { fetchAllRows } from '@/lib/fetchAllRows'
import { supabase } from '@/lib/supabase'

// Timetable rows (supabase/migrations/0008_timetable_marks.sql). Times are
// India time ("HH:MM:SS"); everything here converts the browser clock to
// Asia/Kolkata so a laptop or phone set to another zone still agrees with
// the database about which period is running.

export interface TimetableSlot {
  id: string
  program: string
  year: number
  section: string | null
  day_of_week: number // ISO, 1 = Monday
  starts_at: string
  ends_at: string
  classroom_id: string | null
  subject: string
  teacher: string
  is_mock: boolean
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The standard periods the mock timetable uses; the editor offers these rows.
export const STANDARD_PERIODS: { starts_at: string; ends_at: string }[] = [
  { starts_at: '09:00:00', ends_at: '10:00:00' },
  { starts_at: '10:00:00', ends_at: '11:00:00' },
  { starts_at: '11:15:00', ends_at: '12:15:00' },
  { starts_at: '12:15:00', ends_at: '13:15:00' },
  { starts_at: '14:00:00', ends_at: '15:00:00' },
  { starts_at: '15:00:00', ends_at: '16:00:00' },
]

export const EARLY_CHECKIN_MINUTES = 10

export async function fetchTimetable(): Promise<TimetableSlot[]> {
  if (!supabase) return []
  const client = supabase
  return fetchAllRows<TimetableSlot>((from, to) =>
    client
      .from('timetable')
      .select('id, program, year, section, day_of_week, starts_at, ends_at, classroom_id, subject, teacher, is_mock')
      .order('id')
      .range(from, to),
  )
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function fmtTime(time: string): string {
  return time.slice(0, 5)
}

export function slotLabel(slot: Pick<TimetableSlot, 'starts_at' | 'ends_at'>): string {
  return `${fmtTime(slot.starts_at)} – ${fmtTime(slot.ends_at)}`
}

const IST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})
const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export interface IndiaNow {
  dow: number
  minutes: number
  dateIso: string
}

export function indiaNow(at: Date = new Date()): IndiaNow {
  const parts = Object.fromEntries(IST.formatToParts(at).map((p) => [p.type, p.value]))
  return {
    dow: WEEKDAY_INDEX[parts.weekday] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export function isoDow(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function slotsForGroup(
  slots: TimetableSlot[],
  group: { program: string; year: number; section: string | null },
): TimetableSlot[] {
  return slots.filter(
    (s) => s.program === group.program && s.year === group.year && (s.section === null || s.section === group.section),
  )
}

export function groupLabel(g: { program: string; year: number; section: string | null }): string {
  return `${g.program} · Year ${g.year}${g.section ? ` · ${g.section}` : ''}`
}
