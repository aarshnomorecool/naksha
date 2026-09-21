// Runtime state + simulation, ported from map-demo/campus-map-demo.html.
// `MapState` is the single shape rendered every frame — the simulation
// functions here mutate it today; useSupabaseData.ts mutates the exact same
// shape once a Supabase project is wired up. Nothing downstream needs to
// change when that swap happens.

import { CLASSROOMS, PARKING_SPOTS } from './campusData'

export interface ClassroomState {
  id: string
  building: string
  room: string
  floor: number
  capacity: number
  lng: number
  lat: number
  present_count: number
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
  parking: ParkingState[]
}

export function createSimulatedState(): MapState {
  return {
    classrooms: CLASSROOMS.map((c) => ({ ...c, present_count: Math.round(c.capacity * (0.25 + Math.random() * 0.55)) })),
    parking: PARKING_SPOTS.map((p) => ({ ...p, occupied: Math.random() < 0.55 })),
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function jitterClassroomPresence(state: MapState) {
  state.classrooms.forEach((c) => {
    const walk = Math.round((Math.random() - 0.5) * 12)
    c.present_count = Math.min(c.capacity, Math.max(0, c.present_count + walk))
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
