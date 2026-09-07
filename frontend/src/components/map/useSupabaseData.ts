// Populates/mutates the same MapState shape the simulation (mapState.ts)
// uses, from a live Supabase project instead — an initial fetch plus
// postgres_changes subscriptions. MapView only calls this when
// hasSupabaseConfig is true; otherwise the simulation drives state instead.
//
// Relies on the generated lng/lat columns added in
// supabase/migrations/0001_schema.sql specifically so this never has to
// parse PostGIS geometry (WKB/EWKB) on the client.

import { supabase } from '@/lib/supabase'
import type { MapState } from './mapState'

interface ClassroomRow {
  id: string
  room_number: string
  capacity: number
  current_occupancy: number
  lng: number
  lat: number
  buildings: { name: string } | null
}

interface CurrentBusPositionRow {
  bus_id: string
  label: string
  route_name: string
  lng: number
  lat: number
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
    const [classrooms, buses, parking] = await Promise.all([
      client
        .from('classrooms')
        .select('id, room_number, capacity, current_occupancy, lng, lat, buildings(name)')
        .returns<ClassroomRow[]>(),
      client.from('current_bus_positions').select('*').returns<CurrentBusPositionRow[]>(),
      client.from('parking_spots').select('id, lot_name, lng, lat, occupied').returns<ParkingRow[]>(),
    ])
    if (cancelled) return

    if (classrooms.data) {
      state.classrooms = classrooms.data.map((c) => ({
        id: c.id,
        building: c.buildings?.name ?? '',
        room: c.room_number,
        capacity: c.capacity,
        lng: c.lng,
        lat: c.lat,
        occupancy_pct: c.capacity > 0 ? Math.round((100 * c.current_occupancy) / c.capacity) : 0,
      }))
    }
    if (buses.data) {
      state.buses = buses.data.map((b) => ({
        id: b.bus_id,
        label: b.label,
        route_name: b.route_name,
        waypoints: [],
        segment: 0,
        progress: 0,
        position: [b.lng, b.lat],
      }))
    }
    if (parking.data) {
      state.parking = parking.data.map((p) => ({
        id: p.id,
        lot_name: p.lot_name,
        lng: p.lng,
        lat: p.lat,
        occupied: p.occupied > 0,
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
        const c = state.classrooms.find((x) => x.id === payload.new.id)
        if (c && c.capacity > 0) {
          c.occupancy_pct = Math.round((100 * payload.new.current_occupancy) / c.capacity)
          onChange()
        }
      },
    )
    .subscribe()

  const busChannel = client
    .channel('bus-positions-changes')
    .on<{ bus_id: string; lng: number; lat: number }>(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bus_positions' },
      (payload) => {
        const b = state.buses.find((x) => x.id === payload.new.bus_id)
        if (b) {
          b.position = [payload.new.lng, payload.new.lat]
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
        const p = state.parking.find((x) => x.id === payload.new.id)
        if (p) {
          p.occupied = payload.new.occupied > 0
          onChange()
        }
      },
    )
    .subscribe()

  return () => {
    cancelled = true
    client.removeChannel(classroomChannel)
    client.removeChannel(busChannel)
    client.removeChannel(parkingChannel)
  }
}
