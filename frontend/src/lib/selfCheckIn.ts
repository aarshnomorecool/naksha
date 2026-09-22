import { supabase } from '@/lib/supabase'

// Student self-check-in from a phone that opened a QR link (/scan?room=...).
// Identity is NEVER trusted from the form: the phone sends only a roll
// number, and supabase/migrations/0004_self_check_in.sql resolves it against
// the students table server-side and stamps the time from the DB clock.

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

// Classrooms are public-readable (see 0002_rls.sql), so this works for
// anonymous phones with only the anon key — no login needed.
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

export type SelfCheckInStatus = 'checked_in' | 'already_checked_in' | 'not_found' | 'bad_classroom'

export interface SelfCheckInResult {
  ok: boolean
  status: SelfCheckInStatus
  roll_number?: string
  full_name?: string
}

export async function selfCheckIn(rollNumber: string, classroomId: string): Promise<SelfCheckInResult> {
  if (!supabase) throw new Error('Check-in service is not configured on this device.')
  const { data, error } = await supabase.rpc('self_check_in', {
    p_roll_number: rollNumber.trim(),
    p_classroom_id: classroomId,
  })
  if (error) throw error
  return data as SelfCheckInResult
}

// Absolute check-in URL encoded into classroom QR codes. Built from
// window.location.origin so the same code works on localhost, LAN IP, and the
// deployed site with zero per-environment configuration.
export function buildCheckInUrl(classroomId: string): string {
  return `${window.location.origin}/scan?room=${encodeURIComponent(classroomId)}`
}
