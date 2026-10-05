import type { AttendanceRecord, MarkRecord } from '@/lib/attendanceStats'
import { getDeviceId } from '@/lib/selfCheckIn'
import { supabase } from '@/lib/supabase'
import type { TimetableSlot } from '@/lib/timetable'

// The student's own dashboard, identified only by the phone linked at their
// first QR check-in (student_dashboard / send_mentor_message RPCs in
// supabase/migrations/0008_timetable_marks.sql). No login, no password.

export interface DashboardSlot extends Pick<TimetableSlot, 'id' | 'day_of_week' | 'starts_at' | 'ends_at' | 'subject' | 'teacher'> {
  room_number: string | null
  building_name: string | null
}

export interface DashboardAttendance extends AttendanceRecord {
  subject: string | null
  room_number: string | null
}

export interface SentMessage {
  body: string
  created_at: string
  read_at: string | null
}

export interface StudentDashboard {
  today: string
  tracking_since: string
  student: { id: string; roll_number: string; full_name: string; program: string; year: number; section: string | null }
  timetable: DashboardSlot[]
  attendance: DashboardAttendance[]
  marks: MarkRecord[]
  messages: SentMessage[]
}

export type DashboardResult = { ok: true; data: StudentDashboard } | { ok: false; status: 'not_linked' }

export async function fetchMyDashboard(): Promise<DashboardResult> {
  if (!supabase) throw new Error('The attendance service is not configured on this site copy.')
  const { data, error } = await supabase.rpc('student_dashboard', { p_device_id: getDeviceId() })
  if (error) throw error
  const res = data as ({ ok: true } & StudentDashboard) | { ok: false; status: 'not_linked' }
  if (!res.ok) return { ok: false, status: res.status }
  return { ok: true, data: res }
}

export type SendStatus = 'sent' | 'not_linked' | 'empty' | 'too_long' | 'rate_limited'

export async function sendMentorMessage(body: string): Promise<SendStatus> {
  if (!supabase) throw new Error('The attendance service is not configured on this site copy.')
  const { data, error } = await supabase.rpc('send_mentor_message', { p_device_id: getDeviceId(), p_body: body })
  if (error) throw error
  return (data as { status: SendStatus }).status
}

// The dashboard's slots carry only what the phone needs; the stats helpers
// take full TimetableSlot rows, so fill in the group fields they ignore.
export function asTimetableSlots(d: StudentDashboard): TimetableSlot[] {
  return d.timetable.map((s) => ({
    ...s,
    program: d.student.program,
    year: d.student.year,
    section: d.student.section,
    classroom_id: null,
    is_mock: false,
  }))
}
