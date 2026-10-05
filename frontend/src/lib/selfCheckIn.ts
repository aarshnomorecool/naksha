import { supabase } from '@/lib/supabase'

// Student self-check-in. The teacher's screen shows a QR that rotates every
// ~20s (issue_checkin_token); a student's phone sends that token plus a
// random device id. See supabase/migrations/0005_device_binding.sql — the
// first check-in links the phone to one roll number, and identity, classroom
// and time are all resolved server-side.

export interface ScanClassroom {
  id: string
  roomNumber: string
  buildingName: string
}

interface ScanClassroomRow {
  id: string
  room_number: string
  buildings: { name: string } | null
}

// Classrooms are public-readable (0002_rls.sql). Used only to label the page
// before check-in; the server takes the real classroom from the token.
export async function fetchScanClassroom(classroomId: string): Promise<ScanClassroom | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('classrooms')
    .select('id, room_number, buildings(name)')
    .eq('id', classroomId)
    .maybeSingle<ScanClassroomRow>()
  if (error) throw error
  if (!data) return null
  return { id: data.id, roomNumber: data.room_number, buildingName: data.buildings?.name ?? '—' }
}

export type SelfCheckInStatus =
  | 'checked_in'
  | 'already_checked_in'
  | 'needs_roll_number'
  | 'not_found'
  | 'roll_linked_elsewhere'
  | 'expired_code'
  | 'bad_device'

export interface SelfCheckInResult {
  ok: boolean
  status: SelfCheckInStatus
  roll_number?: string
  full_name?: string
  classroom_id?: string
  room_number?: string
  building_name?: string
  subject?: string | null
  teacher?: string | null
}

export async function selfCheckIn(token: string, rollNumber?: string): Promise<SelfCheckInResult> {
  if (!supabase) throw new Error('Check-in service is not configured on this device.')
  const { data, error } = await supabase.rpc('self_check_in', {
    p_token: token,
    p_device_id: getDeviceId(),
    p_roll_number: rollNumber?.trim() || null,
  })
  if (error) throw error
  return data as SelfCheckInResult
}

const DEVICE_KEY = 'naksha-device-id'
const LINKED_ROLL_KEY = 'naksha-linked-roll'

// crypto.randomUUID() only exists on https/localhost; phones testing over a
// LAN IP (http://192.168.x.x) need the getRandomValues fallback.
function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = randomUuid()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// UI hint only — the server is the source of truth for the link.
export function getLinkedRoll(): string | null {
  return localStorage.getItem(LINKED_ROLL_KEY)
}

export function setLinkedRoll(roll: string | null) {
  if (roll) localStorage.setItem(LINKED_ROLL_KEY, roll)
  else localStorage.removeItem(LINKED_ROLL_KEY)
}

export interface CheckInCode {
  token: string
  expiresAt: string
}

export async function issueCheckInCode(classroomId: string): Promise<CheckInCode> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('issue_checkin_token', { p_classroom_id: classroomId })
  if (error) throw error
  const row = data as { token: string; expires_at: string }
  return { token: row.token, expiresAt: row.expires_at }
}

export function buildCheckInUrl(classroomId: string, token: string): string {
  return `${window.location.origin}/scan?room=${encodeURIComponent(classroomId)}&t=${encodeURIComponent(token)}`
}

export async function fetchLinkedDevice(studentId: string): Promise<{ boundAt: string } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('student_devices')
    .select('bound_at')
    .eq('student_id', studentId)
    .maybeSingle<{ bound_at: string }>()
  if (error) throw error
  return data ? { boundAt: data.bound_at } : null
}

export async function resetStudentDevice(studentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('reset_student_device', { p_student_id: studentId })
  if (error) throw error
}
