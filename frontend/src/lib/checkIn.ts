import { supabase } from '@/lib/supabase'

export interface ClassroomOption {
  id: string
  roomNumber: string
  buildingName: string
}

interface ClassroomQueryRow {
  id: string
  room_number: string
  buildings: { name: string } | null
}

export async function fetchClassrooms(): Promise<ClassroomOption[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('classrooms')
    .select('id, room_number, buildings(name)')
    .order('room_number')
    .returns<ClassroomQueryRow[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    roomNumber: row.room_number,
    buildingName: row.buildings?.name ?? '—',
  }))
}

export interface CheckedInStudent {
  id: string
  rollNumber: string
  fullName: string
}

export type CheckInResult =
  | { status: 'checked_in'; student: CheckedInStudent }
  | { status: 'already_checked_in'; student: CheckedInStudent }
  | { status: 'not_found' }

// One attendance row per (student, classroom, day) — checking the same
// student into the same room twice in a day would otherwise double-count
// classrooms.current_occupancy via the sync trigger in 0001_schema.sql.
export async function checkInByRollNumber(
  rollNumber: string,
  classroomId: string,
  method: 'qr' | 'manual',
): Promise<CheckInResult> {
  if (!supabase) return { status: 'not_found' }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, roll_number, full_name')
    // Exact match: roll numbers are stored uppercase (seed + import), and a
    // pattern filter would let "NKS%" or "NKS*" match an arbitrary student.
    .eq('roll_number', rollNumber.trim().toUpperCase())
    .maybeSingle()
  if (studentError) throw studentError
  if (!student) return { status: 'not_found' }

  const checkedInStudent: CheckedInStudent = {
    id: student.id,
    rollNumber: student.roll_number,
    fullName: student.full_name,
  }

  // The database stamps the current period and enforces one row per
  // (student, room, day, period) — see attendance_one_per_slot in
  // 0008_timetable_marks.sql — so a duplicate shows up as a unique violation.
  const { error: insertError } = await supabase
    .from('attendance')
    .insert({ student_id: student.id, classroom_id: classroomId, method })
  if (insertError?.code === '23505') return { status: 'already_checked_in', student: checkedInStudent }
  if (insertError) throw insertError

  return { status: 'checked_in', student: checkedInStudent }
}
