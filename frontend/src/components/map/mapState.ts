// Runtime state rendered by the map. Nothing here is invented: rooms start at
// zero present and only real check-ins (via useSupabaseData.ts) change them.

import { CLASSROOMS } from './campusData'

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

export interface MapState {
  classrooms: ClassroomState[]
}

// The campus layout before the live list loads: real room names and
// capacities, nobody present.
export function createInitialState(): MapState {
  return { classrooms: CLASSROOMS.map((c) => ({ ...c, present_count: 0 })) }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
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
