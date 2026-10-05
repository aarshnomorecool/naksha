import { supabase } from '@/lib/supabase'
import type { MapState } from './mapState'

interface ClassroomRow {
  id: string
  room_number: string
  floor: number
  capacity: number
  lng: number
  lat: number
  buildings: { name: string } | null
}

// Live classroom occupancy for the public map. Counts come from the
// classroom_occupancy_today view (0009): today's distinct students per room,
// readable by anyone, never naming who. Any check-in updates the classrooms
// row via trigger, which arrives here over realtime and triggers a re-count.
export function subscribeSupabaseData(state: MapState, onChange: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  let cancelled = false

  async function loadCounts() {
    const { data } = await client.from('classroom_occupancy_today').select('classroom_id, present')
    if (cancelled || !data) return
    const byRoom = new Map((data as { classroom_id: string; present: number }[]).map((r) => [r.classroom_id, r.present]))
    for (const c of state.classrooms) c.present_count = byRoom.get(c.id) ?? 0
    onChange()
  }

  async function loadInitial() {
    const { data } = await client
      .from('classrooms')
      .select('id, room_number, floor, capacity, lng, lat, buildings(name)')
      .returns<ClassroomRow[]>()
    if (cancelled) return
    if (data) {
      state.classrooms = data.map((c) => ({
        id: c.id,
        building: c.buildings?.name ?? '',
        room: c.room_number,
        floor: c.floor,
        capacity: c.capacity,
        lng: c.lng,
        lat: c.lat,
        present_count: 0,
      }))
    }
    await loadCounts()
  }

  void loadInitial()

  const channel = client
    .channel('classrooms-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classrooms' }, () => void loadCounts())
    .subscribe()

  return () => {
    cancelled = true
    client.removeChannel(channel)
  }
}
