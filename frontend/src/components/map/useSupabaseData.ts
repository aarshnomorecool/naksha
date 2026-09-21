import { supabase } from '@/lib/supabase'
import type { MapState } from './mapState'

interface ClassroomRow {
  id: string
  room_number: string
  floor: number
  capacity: number
  current_occupancy: number
  lng: number
  lat: number
  buildings: { name: string } | null
}

interface ParkingRow {
  id: string
  lot_name: string
  lng: number
  lat: number
  occupied: number
}

export function subscribeSupabaseData(state: MapState, onChange: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  let cancelled = false

  async function loadInitial() {
    const [classrooms, parking] = await Promise.all([
      client
        .from('classrooms')
        .select('id, room_number, floor, capacity, current_occupancy, lng, lat, buildings(name)')
        .returns<ClassroomRow[]>(),
      client.from('parking_spots').select('id, lot_name, lng, lat, occupied').returns<ParkingRow[]>(),
    ])
    if (cancelled) return

    if (classrooms.data) {
      state.classrooms = classrooms.data.map((classroom) => ({
        id: classroom.id,
        building: classroom.buildings?.name ?? '',
        room: classroom.room_number,
        floor: classroom.floor,
        capacity: classroom.capacity,
        lng: classroom.lng,
        lat: classroom.lat,
        present_count: classroom.current_occupancy,
      }))
    }
    if (parking.data) {
      state.parking = parking.data.map((parkingSpot) => ({
        id: parkingSpot.id,
        lot_name: parkingSpot.lot_name,
        lng: parkingSpot.lng,
        lat: parkingSpot.lat,
        occupied: parkingSpot.occupied > 0,
      }))
    }
    onChange()
  }

  loadInitial()

  const classroomChannel = client
    .channel('classrooms-changes')
    .on<{ id: string; current_occupancy: number }>(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'classrooms' },
      (payload) => {
        const classroom = state.classrooms.find((item) => item.id === payload.new.id)
        if (classroom) {
          classroom.present_count = payload.new.current_occupancy
          onChange()
        }
      },
    )
    .subscribe()

  const parkingChannel = client
    .channel('parking-changes')
    .on<{ id: string; occupied: number }>(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'parking_spots' },
      (payload) => {
        const parkingSpot = state.parking.find((item) => item.id === payload.new.id)
        if (parkingSpot) {
          parkingSpot.occupied = payload.new.occupied > 0
          onChange()
        }
      },
    )
    .subscribe()

  return () => {
    cancelled = true
    client.removeChannel(classroomChannel)
    client.removeChannel(parkingChannel)
  }
}
