// Demo timetable for the campus map + building page.
//
// There is no lectures/teachers table in Supabase yet (see
// supabase/migrations/0001_schema.sql) — so this module derives a stable,
// per-classroom "current lecture" deterministically from the classroom id.
// Same classroom always shows the same subject/teacher; the time slot follows
// the actual clock so it reads as "currently going on" during college hours.
//
// When a real timetable lands in the DB, replace getCurrentLecture() with a
// Supabase query and keep the return shape — MapView + BuildingDetailPage
// both consume this shape and won't need to change.

export interface CurrentLecture {
  subject: string
  teacher: string
  timeSlot: string
  status: 'live' | 'break' | 'done'
}

const SUBJECTS_BY_BUILDING: Record<string, string[]> = {
  'Main Academic Block': [
    'Engineering Mathematics',
    'Applied Physics',
    'Communication Skills',
    'Basic Electrical Engineering',
    'Engineering Graphics',
  ],
  'Computer Science Block': [
    'Data Structures',
    'Operating Systems',
    'Database Management',
    'Computer Networks',
    'Machine Learning Basics',
  ],
  Library: ['Self Study', 'Reference Hour', 'Digital Literacy'],
}

const FALLBACK_SUBJECTS = ['Applied Sciences', 'Seminar', 'Tutorial Hour']

const TEACHERS = [
  'Dr. S. Deshmukh',
  'Prof. R. Kulkarni',
  'Dr. P. Joshi',
  'Prof. A. Patil',
  'Dr. N. Sharma',
  'Prof. V. Rao',
  'Dr. K. Iyer',
  'Prof. M. Nair',
]

const SLOTS = [
  '09:00 – 10:00',
  '10:00 – 11:00',
  '11:15 – 12:15',
  '12:15 – 13:15',
  '14:00 – 15:00',
  '15:00 – 16:00',
  '16:15 – 17:15',
]

function hashString(value: string): number {
  return Array.from(value).reduce((total, ch) => total + ch.charCodeAt(0), 0)
}

export function getCurrentLecture(
  classroomId: string,
  building: string,
  now: Date = new Date(),
): CurrentLecture {
  const subjects = SUBJECTS_BY_BUILDING[building] ?? FALLBACK_SUBJECTS
  const seed = hashString(`${building}:${classroomId}`)
  const subject = subjects[seed % subjects.length]
  const teacher = TEACHERS[(seed >> 3) % TEACHERS.length]

  const hour = now.getHours()
  // College hours 9:00–17:30. Map the wall clock onto a slot; outside hours
  // the card reads as "done for today" instead of inventing a live class.
  if (hour < 9) {
    return { subject, teacher, timeSlot: SLOTS[0], status: 'break' }
  }
  if (hour >= 17) {
    return { subject, teacher, timeSlot: SLOTS[SLOTS.length - 1], status: 'done' }
  }
  if (hour === 13) {
    return { subject, teacher, timeSlot: '13:15 – 14:00', status: 'break' }
  }
  const slotIndex = hour < 13 ? hour - 9 : hour - 10
  const timeSlot = SLOTS[Math.min(slotIndex, SLOTS.length - 1)]
  return { subject, teacher, timeSlot, status: 'live' }
}
