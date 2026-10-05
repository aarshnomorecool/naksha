import type { AttendanceRecord, MarkRecord } from '@/lib/attendanceStats'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { supabase } from '@/lib/supabase'
import type { TimetableSlot } from '@/lib/timetable'

// Staff-side reads/writes for timetable, exams/marks, resets and messages
// (tables + RLS in supabase/migrations/0008_timetable_marks.sql).

function db() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export interface Group {
  program: string
  year: number
  section: string | null
}

export function groupKey(g: Group): string {
  return `${g.program}|${g.year}|${g.section ?? ''}`
}

export function parseGroupKey(key: string): Group {
  const [program, year, section] = key.split('|')
  return { program, year: Number(year), section: section || null }
}

export async function fetchGroups(): Promise<Group[]> {
  const client = db()
  const rows = await fetchAllRows<Group>((from, to) =>
    client.from('students').select('program, year, section').order('id').range(from, to),
  )
  const seen = new Map<string, Group>()
  for (const r of rows) seen.set(groupKey(r), { program: r.program, year: r.year, section: r.section })
  return [...seen.values()].sort((a, b) => groupKey(a).localeCompare(groupKey(b), undefined, { numeric: true }))
}

export interface GroupStudent {
  id: string
  roll_number: string
  full_name: string
}

export async function fetchGroupStudents(g: Group): Promise<GroupStudent[]> {
  let query = db().from('students').select('id, roll_number, full_name').eq('program', g.program).eq('year', g.year)
  query = g.section === null ? query.is('section', null) : query.eq('section', g.section)
  const { data, error } = await query.order('roll_number')
  if (error) throw error
  return data ?? []
}

// ── Student page ─────────────────────────────────────────────────────────

export interface StudentAcademics {
  student: Group & { id: string; tracking_since: string; created_at: string }
  attendance: AttendanceRecord[]
  marks: MarkRecord[]
  messages: InboxMessage[]
}

export async function fetchStudentAcademics(studentId: string): Promise<StudentAcademics> {
  const client = db()
  const { data: student, error } = await client
    .from('students')
    .select('id, program, year, section, tracking_since, created_at')
    .eq('id', studentId)
    .single()
  if (error) throw error

  const [attendance, marksRes, messagesRes] = await Promise.all([
    fetchAllRows<AttendanceRecord>((from, to) =>
      client
        .from('attendance')
        .select('session_date, timetable_id, check_in_time')
        .eq('student_id', studentId)
        .gte('session_date', student.tracking_since)
        .order('id')
        .range(from, to),
    ),
    client
      .from('marks')
      .select('score, exams(name, subject, exam_date, max_marks)')
      .eq('student_id', studentId)
      .returns<{ score: number; exams: { name: string; subject: string; exam_date: string; max_marks: number } | null }[]>(),
    client
      .from('mentor_messages')
      .select('id, body, created_at, read_at, student_id, students(full_name, roll_number)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<InboxRow[]>(),
  ])
  if (marksRes.error) throw marksRes.error
  if (messagesRes.error) throw messagesRes.error

  return {
    student,
    attendance,
    marks: (marksRes.data ?? [])
      .filter((m) => m.exams)
      .map((m) => ({
        exam: m.exams!.name,
        subject: m.exams!.subject,
        exam_date: m.exams!.exam_date,
        max_marks: m.exams!.max_marks,
        score: m.score,
      })),
    messages: (messagesRes.data ?? []).map(toInbox),
  }
}

export async function resetStudentData(studentId: string, mode: 'baseline' | 'all'): Promise<void> {
  const { error } = await db().rpc('reset_student_data', { p_student_id: studentId, p_mode: mode })
  if (error) throw error
}

// ── Messages ─────────────────────────────────────────────────────────────

export interface InboxMessage {
  id: string
  body: string
  created_at: string
  read_at: string | null
  student_id: string
  student_name: string
  roll_number: string
}

interface InboxRow {
  id: string
  body: string
  created_at: string
  read_at: string | null
  student_id: string
  students: { full_name: string; roll_number: string } | null
}

function toInbox(r: InboxRow): InboxMessage {
  return {
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    read_at: r.read_at,
    student_id: r.student_id,
    student_name: r.students?.full_name ?? '—',
    roll_number: r.students?.roll_number ?? '—',
  }
}

export async function fetchInbox(): Promise<{ unread: number; recent: InboxMessage[] }> {
  const client = db()
  const [recentRes, unreadRes] = await Promise.all([
    client
      .from('mentor_messages')
      .select('id, body, created_at, read_at, student_id, students(full_name, roll_number)')
      .order('created_at', { ascending: false })
      .limit(8)
      .returns<InboxRow[]>(),
    client.from('mentor_messages').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  if (recentRes.error) throw recentRes.error
  if (unreadRes.error) throw unreadRes.error
  return { unread: unreadRes.count ?? 0, recent: (recentRes.data ?? []).map(toInbox) }
}

export async function markMessagesRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db().from('mentor_messages').update({ read_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

export function subscribeInbox(onChange: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('mentor-inbox')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mentor_messages' }, onChange)
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}

// ── Timetable editing ────────────────────────────────────────────────────

export type SlotInput = Pick<TimetableSlot, 'program' | 'year' | 'section' | 'day_of_week' | 'starts_at' | 'ends_at' | 'classroom_id' | 'subject' | 'teacher'>

export async function saveSlot(id: string | null, input: SlotInput): Promise<void> {
  // Any slot a mentor touches is real from now on.
  const row = { ...input, subject: input.subject.trim(), teacher: input.teacher.trim() || 'XYZ', is_mock: false }
  const { error } = id ? await db().from('timetable').update(row).eq('id', id) : await db().from('timetable').insert(row)
  if (error) throw error
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await db().from('timetable').delete().eq('id', id)
  if (error) throw error
}

// ── Exams and marks ──────────────────────────────────────────────────────

export interface Exam {
  id: string
  name: string
  subject: string
  program: string
  year: number
  section: string | null
  exam_date: string
  max_marks: number
  is_mock: boolean
}

export async function fetchExams(g: Group): Promise<Exam[]> {
  let query = db()
    .from('exams')
    .select('id, name, subject, program, year, section, exam_date, max_marks, is_mock')
    .eq('program', g.program)
    .eq('year', g.year)
  query = g.section === null ? query.is('section', null) : query.eq('section', g.section)
  const { data, error } = await query.order('exam_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createExam(input: Omit<Exam, 'id' | 'is_mock'>): Promise<Exam> {
  const { data, error } = await db()
    .from('exams')
    .insert({ ...input, name: input.name.trim(), subject: input.subject.trim() })
    .select('id, name, subject, program, year, section, exam_date, max_marks, is_mock')
    .single()
  if (error) throw error
  return data
}

export async function fetchExamMarks(examId: string): Promise<Map<string, number>> {
  const { data, error } = await db().from('marks').select('student_id, score').eq('exam_id', examId)
  if (error) throw error
  return new Map((data ?? []).map((r: { student_id: string; score: number }) => [r.student_id, Number(r.score)]))
}

// Upserts entered scores; a blank box deletes that student's score.
export async function saveExamMarks(examId: string, scores: Map<string, number | null>): Promise<void> {
  const client = db()
  const upserts = [...scores].filter(([, v]) => v !== null).map(([student_id, score]) => ({ exam_id: examId, student_id, score, is_mock: false }))
  const clears = [...scores].filter(([, v]) => v === null).map(([id]) => id)
  if (upserts.length) {
    const { error } = await client.from('marks').upsert(upserts, { onConflict: 'exam_id,student_id' })
    if (error) throw error
  }
  if (clears.length) {
    const { error } = await client.from('marks').delete().eq('exam_id', examId).in('student_id', clears)
    if (error) throw error
  }
}
