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
    .ilike('roll_number', rollNumber.trim())
    .maybeSingle()
  if (studentError) throw studentError
  if (!student) return { status: 'not_found' }

  const checkedInStudent: CheckedInStudent = {
    id: student.id,
    rollNumber: student.roll_number,
    fullName: student.full_name,
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: existing, error: existingError } = await supabase
    .from('attendance')
    .select('id')
    .eq('student_id', student.id)
    .eq('classroom_id', classroomId)
    .eq('session_date', today)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return { status: 'already_checked_in', student: checkedInStudent }

  const { error: insertError } = await supabase
    .from('attendance')
    .insert({ student_id: student.id, classroom_id: classroomId, method })
  if (insertError) throw insertError

  return { status: 'checked_in', student: checkedInStudent }
}
