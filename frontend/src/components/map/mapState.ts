// Runtime state + simulation, ported from map-demo/campus-map-demo.html.
// `MapState` is the single shape rendered every frame — the simulation
// functions here mutate it today; useSupabaseData.ts mutates the exact same
// shape once a Supabase project is wired up. Nothing downstream needs to
// change when that swap happens.

import { BUS_ROUTES, CLASSROOMS, PARKING_SPOTS, type BusRoute } from './campusData'

export interface ClassroomState {
  id: string
  building: string
  room: string
  capacity: number
  lng: number
  lat: number
  occupancy_pct: number
}

export interface BusState {
  id: string
  label: string
  route_name: string
  waypoints: [number, number][]
  segment: number
  progress: number
  position: [number, number]
}

export interface ParkingState {
  id: string
  lot_name: string
  lng: number
  lat: number
  occupied: boolean
}

export interface MapState {
  classrooms: ClassroomState[]
  buses: BusState[]
  parking: ParkingState[]
}

export function createSimulatedState(): MapState {
  return {
    classrooms: CLASSROOMS.map((c) => ({ ...c, occupancy_pct: Math.round(20 + Math.random() * 60) })),
    buses: BUS_ROUTES.map((r: BusRoute) => ({
      ...r,
      segment: 0,
      progress: Math.random(),
      position: r.waypoints[0],
    })),
    parking: PARKING_SPOTS.map((p) => ({ ...p, occupied: Math.random() < 0.55 })),
  }
}

const SECONDS_PER_SEGMENT = 4

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function stepBuses(state: MapState, dtSeconds: number) {
  state.buses.forEach((bus) => {
    bus.progress += dtSeconds / SECONDS_PER_SEGMENT
    while (bus.progress >= 1) {
      bus.progress -= 1
      bus.segment = (bus.segment + 1) % (bus.waypoints.length - 1)
    }
    const from = bus.waypoints[bus.segment]
    const to = bus.waypoints[bus.segment + 1]
    bus.position = [lerp(from[0], to[0], bus.progress), lerp(from[1], to[1], bus.progress)]
  })
}

export function jitterOccupancy(state: MapState) {
  state.classrooms.forEach((c) => {
    const walk = (Math.random() - 0.5) * 25
    c.occupancy_pct = Math.min(100, Math.max(0, Math.round(c.occupancy_pct + walk)))
  })
}

export function jitterParking(state: MapState) {
  state.parking.forEach((p) => {
    if (Math.random() < 0.12) p.occupied = !p.occupied
  })
}

function lerpColor(a: number[], b: number[], t: number): [number, number, number] {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]
}

// green (low) -> amber (mid) -> red (high)
export function occupancyColor(pct: number): [number, number, number] {
  const GREEN = [34, 197, 94], AMBER = [245, 158, 11], RED = [239, 68, 68]
  if (pct <= 50) return lerpColor(GREEN, AMBER, pct / 50)
  return lerpColor(AMBER, RED, (pct - 50) / 50)
}

export function squareRing(lng: number, lat: number, halfSizeDeg: number, z: number): [number, number, number][] {
  return [
    [lng - halfSizeDeg, lat - halfSizeDeg, z],
    [lng + halfSizeDeg, lat - halfSizeDeg, z],
    [lng + halfSizeDeg, lat + halfSizeDeg, z],
    [lng - halfSizeDeg, lat + halfSizeDeg, z],
  ]
}
