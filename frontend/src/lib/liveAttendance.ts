import { supabase } from '@/lib/supabase'

// Live "today" feed for the mentor dashboard. Everything here reads the real
// attendance table — the same rows written by the kiosk (CheckInPage) and by
// student phones (/scan via the self_check_in RPC). No mock data.

export interface TodayCheckIn {
  id: string
  check_in_time: string
  method: string
  student_name: string
  roll_number: string
  room_number: string
  building_name: string
}

export interface RoomOccupancy {
  classroom_id: string
  room_number: string
  building_name: string
  capacity: number
  // Tallied from today's real attendance rows (not the trigger-maintained
  // current_occupancy column, which goes stale overnight).
  present: number
}

export interface TodaySummary {
  total: number
  roomsActive: number
  rooms: RoomOccupancy[]
  recent: TodayCheckIn[]
}

interface RecentRow {
  id: string
  check_in_time: string
  method: string
  students: { full_name: string; roll_number: string } | null
  classrooms: { room_number: string; buildings: { name: string } | null } | null
}

interface RoomRow {
  id: string
  room_number: string
  capacity: number
  buildings: { name: string } | null
}

interface TodayCountRow {
  classroom_id: string
}

export async function fetchTodaySummary(): Promise<TodaySummary> {
  if (!supabase) return { total: 0, roomsActive: 0, rooms: [], recent: [] }
  const today = new Date().toISOString().slice(0, 10)

  const [attendanceRes, roomsRes, countsRes] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, check_in_time, method, students(full_name, roll_number), classrooms(room_number, buildings(name))', { count: 'exact' })
      .eq('session_date', today)
      .order('check_in_time', { ascending: false })
      .limit(20)
      .returns<RecentRow[]>(),
    supabase
      .from('classrooms')
      .select('id, room_number, capacity, buildings(name)')
      .order('room_number')
      .returns<RoomRow[]>(),
    // Per-room today's counts from REAL rows — current_occupancy goes stale
    // overnight (the trigger only runs on writes), so never trust it here.
    supabase
      .from('attendance')
      .select('classroom_id')
      .eq('session_date', today)
      .returns<TodayCountRow[]>(),
  ])
  if (attendanceRes.error) throw attendanceRes.error
  if (roomsRes.error) throw roomsRes.error
  if (countsRes.error) throw countsRes.error

  const recent: TodayCheckIn[] = (attendanceRes.data ?? []).map((row) => ({
    id: row.id,
    check_in_time: row.check_in_time,
    method: row.method,
    student_name: row.students?.full_name ?? '—',
    roll_number: row.students?.roll_number ?? '—',
    room_number: row.classrooms?.room_number ?? '—',
    building_name: row.classrooms?.buildings?.name ?? '—',
  }))

  const todayByRoom = new Map<string, number>()
  for (const row of countsRes.data ?? []) {
    todayByRoom.set(row.classroom_id, (todayByRoom.get(row.classroom_id) ?? 0) + 1)
  }

  const rooms: RoomOccupancy[] = (roomsRes.data ?? []).map((row) => ({
    classroom_id: row.id,
    room_number: row.room_number,
    building_name: row.buildings?.name ?? '—',
    capacity: row.capacity,
    present: todayByRoom.get(row.id) ?? 0,
  }))

  return {
    total: attendanceRes.count ?? recent.length,
    roomsActive: rooms.filter((r) => r.present > 0).length,
    rooms,
    recent,
  }
}

// Re-fetch on every new check-in or occupancy change. Small scale (one campus)
// so a full summary refresh per event is cheaper than stitching partial rows.
export function subscribeTodayAttendance(onChange: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('today-attendance')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classrooms' }, onChange)
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}
