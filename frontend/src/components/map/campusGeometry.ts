// Derived 3D geometry for the campus map: floor slabs, the per-floor room
// layout used by the cutaway, and the generated surroundings (lawn, paths,
// road, trees). Everything is computed from BUILDINGS + the live classroom
// list, so swapping in real traced footprints only means
// editing campusData.ts.
//
// Room layout assumes roughly rectangular footprints (it works on the ring's
// bounding box): a corridor runs down the long axis with rooms on both sides.

import { BUILDINGS, CAMPUS_CENTER, type Building } from './campusData'
import type { ClassroomState } from './mapState'

export type LngLat = [number, number]
export type Ring3 = [number, number, number][]

const M_PER_DEG_LAT = 110_750
const M_PER_DEG_LNG = 111_320 * Math.cos((CAMPUS_CENTER[1] * Math.PI) / 180)

export const FLOOR_H = 3.6
export const EXPLODE_GAP = 9
export const ROOM_H = 2.8
export const PLATE_H = 0.35
const CORRIDOR_W = 3
const WALL_INSET = 1
const ROOM_GAP = 0.6

export interface Rect {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export function ringBounds(ring: LngLat[]): Rect {
  return {
    minLng: Math.min(...ring.map((p) => p[0])),
    minLat: Math.min(...ring.map((p) => p[1])),
    maxLng: Math.max(...ring.map((p) => p[0])),
    maxLat: Math.max(...ring.map((p) => p[1])),
  }
}

export function inflate(r: Rect, meters: number): Rect {
  const dLng = meters / M_PER_DEG_LNG
  const dLat = meters / M_PER_DEG_LAT
  return { minLng: r.minLng - dLng, minLat: r.minLat - dLat, maxLng: r.maxLng + dLng, maxLat: r.maxLat + dLat }
}

export function rectRing(r: Rect, z = 0): Ring3 {
  return [
    [r.minLng, r.minLat, z],
    [r.maxLng, r.minLat, z],
    [r.maxLng, r.maxLat, z],
    [r.minLng, r.maxLat, z],
  ]
}

export function rectCenter(r: Rect): LngLat {
  return [(r.minLng + r.maxLng) / 2, (r.minLat + r.maxLat) / 2]
}

function contains(r: Rect, [lng, lat]: LngLat): boolean {
  return lng >= r.minLng && lng <= r.maxLng && lat >= r.minLat && lat <= r.maxLat
}

export function distanceMeters(a: LngLat, b: LngLat): number {
  const dx = (a[0] - b[0]) * M_PER_DEG_LNG
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

// ── Floors ────────────────────────────────────────────────────────────────

export function floorCount(building: Building, classrooms: ClassroomState[]): number {
  const highest = classrooms
    .filter((c) => c.building === building.name)
    .reduce((max, c) => Math.max(max, c.floor), 0)
  return Math.max(building.floors, highest, 1)
}

// Base height of a storey (1-based floor number), with the cutaway spreading
// storeys apart by EXPLODE_GAP * t.
export function floorBaseZ(floor: number, explodeT: number): number {
  return (floor - 1) * (FLOOR_H + EXPLODE_GAP * explodeT)
}

// ── Room layout ───────────────────────────────────────────────────────────

export interface RoomCell {
  classroomId: string
  buildingId: string
  floor: number
  rect: Rect
  center: LngLat
  // Midpoint of the room's outer wall. Labels go here so the two rows of a
  // corridor plan don't stack their labels on the same screen spot.
  labelAnchor: LngLat
}

export function layoutRooms(building: Building, classrooms: ClassroomState[]): RoomCell[] {
  const bounds = ringBounds(building.ring)
  const W = (bounds.maxLng - bounds.minLng) * M_PER_DEG_LNG
  const D = (bounds.maxLat - bounds.minLat) * M_PER_DEG_LAT
  const longIsX = W >= D
  const L = longIsX ? W : D
  const S = longIsX ? D : W

  // local (u along long axis, v across) -> lng/lat
  const toLngLat = (u: number, v: number): LngLat => {
    const x = longIsX ? u : v
    const y = longIsX ? v : u
    return [bounds.minLng + x / M_PER_DEG_LNG, bounds.minLat + y / M_PER_DEG_LAT]
  }
  const cellRect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const a = toLngLat(u0, v0)
    const b = toLngLat(u1, v1)
    return {
      minLng: Math.min(a[0], b[0]),
      minLat: Math.min(a[1], b[1]),
      maxLng: Math.max(a[0], b[0]),
      maxLat: Math.max(a[1], b[1]),
    }
  }

  const rows: [number, number][] = [
    [S / 2 + CORRIDOR_W / 2, S - WALL_INSET],
    [WALL_INSET, S / 2 - CORRIDOR_W / 2],
  ]

  const byFloor = new Map<number, ClassroomState[]>()
  for (const c of classrooms.filter((c) => c.building === building.name)) {
    byFloor.set(c.floor, [...(byFloor.get(c.floor) ?? []), c])
  }

  const cells: RoomCell[] = []
  for (const [floor, rooms] of byFloor) {
    const sorted = [...rooms].sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
    const perRow = [Math.ceil(sorted.length / 2), Math.floor(sorted.length / 2)]
    let i = 0
    perRow.forEach((n, rowIdx) => {
      if (n === 0) return
      const [v0, v1] = rows[rowIdx]
      const span = L - 2 * WALL_INSET
      const w = (span - ROOM_GAP * (n - 1)) / n
      for (let k = 0; k < n; k++) {
        const u0 = WALL_INSET + k * (w + ROOM_GAP)
        const rect = cellRect(u0, u0 + w, v0, v1)
        const room = sorted[i++]
        const labelAnchor = toLngLat(u0 + w / 2, rowIdx === 0 ? v1 : v0)
        cells.push({ classroomId: room.id, buildingId: building.id, floor, rect, center: rectCenter(rect), labelAnchor })
      }
    })
  }
  return cells
}

// ── Surroundings ──────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Surroundings {
  lawn: Rect
  road: LngLat[]
  paths: LngLat[][]
  trees: { position: LngLat; scale: number; shade: number }[]
}

export function buildSurroundings(): Surroundings {
  const buildingRects = BUILDINGS.map((b) => ringBounds(b.ring))
  const all = buildingRects
  const extent: Rect = {
    minLng: Math.min(...all.map((r) => r.minLng)),
    minLat: Math.min(...all.map((r) => r.minLat)),
    maxLng: Math.max(...all.map((r) => r.maxLng)),
    maxLat: Math.max(...all.map((r) => r.maxLat)),
  }
  const lawn = inflate(extent, 24)

  const roadLat = lawn.minLat + 8 / M_PER_DEG_LAT
  const road: LngLat[] = [
    [lawn.minLng - 40 / M_PER_DEG_LNG, roadLat],
    [lawn.maxLng + 40 / M_PER_DEG_LNG, roadLat],
  ]

  // Promenade between the building rows, a spur to each building's facing
  // edge, and a gate path down to the road.
  const centers = buildingRects.map(rectCenter)
  const midLat = centers.reduce((s, c) => s + c[1], 0) / centers.length
  const inset = 12 / M_PER_DEG_LNG
  const paths: LngLat[][] = [[[extent.minLng + inset, midLat], [extent.maxLng - inset, midLat]]]
  buildingRects.forEach((r, i) => {
    const edgeLat = centers[i][1] > midLat ? r.minLat : r.maxLat
    paths.push([[centers[i][0], edgeLat], [centers[i][0], midLat]])
  })
  const gateLng = (extent.minLng + extent.maxLng) / 2
  paths.push([[gateLng, midLat], [gateLng, roadLat]])

  const nearPath = (p: LngLat) =>
    paths.some((seg) => {
      const [a, b] = seg
      const minLng = Math.min(a[0], b[0])
      const maxLng = Math.max(a[0], b[0])
      const minLat = Math.min(a[1], b[1])
      const maxLat = Math.max(a[1], b[1])
      return contains(inflate({ minLng, minLat, maxLng, maxLat }, 4.5), p)
    })
  const blocked = buildingRects.map((r) => inflate(r, 7))

  const rand = mulberry32(20250913)
  const trees: Surroundings['trees'] = []

  // Avenue along both sides of the promenade.
  const [promStart, promEnd] = paths[0]
  for (let x = promStart[0]; x <= promEnd[0]; x += 11 / M_PER_DEG_LNG) {
    for (const side of [-1, 1]) {
      const p: LngLat = [x, midLat + (side * 5) / M_PER_DEG_LAT]
      if (blocked.some((r) => contains(r, p)) || paths.slice(1).some((seg) => Math.abs(seg[0][0] - x) * M_PER_DEG_LNG < 4)) continue
      trees.push({ position: p, scale: 1, shade: 0.4 })
    }
  }

  // Light scatter across the rest of the lawn.
  const step = 16
  for (let x = lawn.minLng; x <= lawn.maxLng; x += step / M_PER_DEG_LNG) {
    for (let y = roadLat + 9 / M_PER_DEG_LAT; y <= lawn.maxLat; y += step / M_PER_DEG_LAT) {
      const p: LngLat = [x + ((rand() - 0.5) * 8) / M_PER_DEG_LNG, y + ((rand() - 0.5) * 8) / M_PER_DEG_LAT]
      if (!contains(lawn, p) || blocked.some((r) => contains(r, p)) || nearPath(p)) continue
      if (rand() < 0.55) continue
      trees.push({ position: p, scale: 0.8 + rand() * 0.5, shade: rand() })
    }
  }

  return { lawn, road, paths, trees }
}
