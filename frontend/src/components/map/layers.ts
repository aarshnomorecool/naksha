import { ColumnLayer, PathLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers'
import { BUILDINGS, type Building } from './campusData'
import {
  buildSurroundings,
  floorBaseZ,
  floorCount,
  FLOOR_H,
  inflate,
  layoutRooms,
  parkingLots,
  PLATE_H,
  rectRing,
  ringBounds,
  ROOM_H,
  spotRect,
  type ParkingLot,
  type Ring3,
  type RoomCell,
  type Surroundings,
} from './campusGeometry'
import { getCurrentLecture } from './lectureInfo'
import { occupancyColor, type ClassroomState, type MapState } from './mapState'

// Bus layer is intentionally NOT built here — see busBackup.ts for the
// preserved routes + restoration steps.

type RGBA = [number, number, number, number]

const WALL: RGBA = [236, 232, 224, 255]
const GLASS: RGBA = [86, 112, 140, 255]
const ROOF: RGBA = [214, 212, 205, 255]
const PLATE: RGBA = [228, 229, 231, 255]
const CAR_COLORS: RGBA[] = [
  [226, 232, 240, 255],
  [148, 163, 184, 255],
  [30, 41, 59, 255],
  [185, 28, 28, 255],
  [30, 64, 175, 255],
  [212, 212, 216, 255],
]

export function classroomPct(classroom: Pick<ClassroomState, 'present_count' | 'capacity'>): number {
  if (classroom.capacity <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((100 * classroom.present_count) / classroom.capacity)))
}

function mix(a: RGBA, b: [number, number, number], t: number, alpha = a[3]): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    alpha,
  ]
}

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

export interface ShellPiece {
  building: Building
  ring: Ring3
  height: number
  color: RGBA
}

export interface RoomPiece {
  cell: RoomCell
  classroom: ClassroomState
  ring: Ring3
  height: number
  color: RGBA
}

export interface MapLayerCallbacks {
  onBuildingClick: (building: Building) => void
  onRoomClick: (classroom: ClassroomState) => void
}

export interface LayerInput {
  state: MapState
  tick: number
  // eased 0..1 cutaway progress per building id
  explode: Record<string, number>
  selectedRoomId?: string
  callbacks: MapLayerCallbacks
}

let surroundingsCache: { key: string; value: Surroundings } | null = null
function surroundingsFor(state: MapState): Surroundings {
  const key = state.parking.map((p) => p.id).join(',')
  if (!surroundingsCache || surroundingsCache.key !== key) {
    surroundingsCache = { key, value: buildSurroundings(state.parking) }
  }
  return surroundingsCache.value
}

export function buildLayers({ state, tick, explode, selectedRoomId, callbacks }: LayerInput) {
  const env = surroundingsFor(state)
  const lots = parkingLots(state.parking)
  const anyOpen = Object.values(explode).some((t) => t > 0.01)

  const shell: ShellPiece[] = []
  const plates: ShellPiece[] = []
  const rooms: RoomPiece[] = []
  const floorLabels: { position: [number, number, number]; text: string; alpha: number }[] = []
  const buildingLabels: { position: [number, number, number]; text: string; alpha: number }[] = []

  for (const building of BUILDINGS) {
    const t = explode[building.id] ?? 0
    const floors = floorCount(building, state.classrooms)
    const bounds = ringBounds(building.ring)
    const cells = layoutRooms(building, state.classrooms)
    const byId = new Map(state.classrooms.map((c) => [c.id, c]))
    // Other buildings step back while one is opened.
    const focusAlpha = anyOpen && t < 0.01 ? 120 : 255
    const shellAlpha = Math.round(focusAlpha * (1 - t))

    for (let f = 1; f <= floors; f++) {
      const z = floorBaseZ(f, t)
      const floorRooms = cells.filter((c) => c.floor === f).map((c) => byId.get(c.classroomId)!).filter(Boolean)
      const avgPct = floorRooms.length
        ? floorRooms.reduce((s, c) => s + classroomPct(c), 0) / floorRooms.length
        : null

      if (shellAlpha > 8) {
        shell.push({ building, ring: rectRing(bounds, z), height: FLOOR_H * 0.6, color: [...WALL.slice(0, 3), shellAlpha] as RGBA })
        const glass = avgPct === null ? GLASS : mix(GLASS, occupancyColor(avgPct), 0.45)
        shell.push({
          building,
          ring: rectRing(inflate(bounds, -0.3), z + FLOOR_H * 0.6),
          height: FLOOR_H * 0.4,
          color: [...glass.slice(0, 3), shellAlpha] as RGBA,
        })
      }

      if (t > 0.01) {
        plates.push({ building, ring: rectRing(bounds, z), height: PLATE_H, color: PLATE })
        floorLabels.push({
          position: [bounds.minLng, bounds.minLat, z + 1.5],
          text: `Floor ${f}`,
          alpha: Math.round(255 * Math.max(0, (t - 0.5) / 0.5)),
        })
      }
    }

    if (shellAlpha > 8) {
      shell.push({ building, ring: rectRing(bounds, floors * FLOOR_H), height: 0.8, color: [...ROOF.slice(0, 3), shellAlpha] as RGBA })
    }

    if (t > 0.05) {
      for (const cell of cells) {
        const classroom = byId.get(cell.classroomId)
        if (!classroom) continue
        const selected = classroom.id === selectedRoomId
        const base = floorBaseZ(cell.floor, t) + PLATE_H
        rooms.push({
          cell,
          classroom,
          ring: rectRing(cell.rect, base),
          height: ROOM_H * t + (selected ? 0.8 : 0),
          color: [...occupancyColor(classroomPct(classroom)), selected ? 255 : 230] as RGBA,
        })
      }
    }

    buildingLabels.push({
      position: [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2, floors * FLOOR_H + 5],
      text: building.shortLabel,
      alpha: Math.round(255 * (1 - t) * (focusAlpha / 255)),
    })
  }

  const lawnLayer = new SolidPolygonLayer({
    id: 'lawn',
    data: [{ ring: rectRing(env.lawn) }],
    getPolygon: (d: { ring: Ring3 }) => d.ring,
    getFillColor: [190, 210, 172, 255],
  })

  const roadLayer = new PathLayer({
    id: 'road',
    data: [{ path: env.road }],
    getPath: (d: { path: [number, number][] }) => d.path,
    getWidth: 9,
    widthUnits: 'meters',
    getColor: [128, 136, 146, 255],
    capRounded: false,
  })

  const pathsLayer = new PathLayer({
    id: 'walkways',
    data: env.paths.map((path) => ({ path })),
    getPath: (d: { path: [number, number][] }) => d.path,
    getWidth: 3.5,
    widthUnits: 'meters',
    getColor: [238, 233, 222, 255],
    capRounded: true,
    jointRounded: true,
  })

  const lotsLayer = new SolidPolygonLayer<ParkingLot>({
    id: 'parking-lots',
    data: lots,
    getPolygon: (lot) => rectRing(lot.rect),
    getFillColor: [112, 118, 126, 255],
    pickable: true,
    updateTriggers: { getPolygon: tick },
  })

  const slotsLayer = new SolidPolygonLayer({
    id: 'parking-slots',
    data: state.parking,
    getPolygon: (spot) => rectRing(spotRect(spot, 5.2, 2.7), 0.02),
    getFillColor: [134, 140, 148, 255],
  })

  const carsLayer = new SolidPolygonLayer({
    id: 'cars',
    data: state.parking.filter((p) => p.occupied),
    getPolygon: (spot) => rectRing(spotRect(spot), 0.05),
    extruded: true,
    getElevation: 1.45,
    getFillColor: (spot) => CAR_COLORS[hash(spot.id) % CAR_COLORS.length],
    updateTriggers: { getFillColor: tick },
  })

  const trunksLayer = new ColumnLayer({
    id: 'tree-trunks',
    data: env.trees,
    getPosition: (tree) => tree.position,
    radius: 0.3,
    diskResolution: 6,
    extruded: true,
    getElevation: (tree) => 2.2 * tree.scale,
    getFillColor: [120, 92, 66, 255],
  })

  const canopyLayer = new ColumnLayer({
    id: 'tree-canopies',
    data: env.trees,
    getPosition: (tree) => [tree.position[0], tree.position[1], 1.8 * tree.scale],
    radius: 2.1,
    diskResolution: 9,
    extruded: true,
    getElevation: (tree) => 3.6 * tree.scale,
    getFillColor: (tree) => [Math.round(74 + tree.shade * 30), Math.round(122 + tree.shade * 26), Math.round(68 + tree.shade * 14), 255],
  })

  const shellLayer = new SolidPolygonLayer<ShellPiece>({
    id: 'building-shell',
    data: shell,
    getPolygon: (d) => d.ring,
    extruded: true,
    getElevation: (d) => d.height,
    getFillColor: (d) => d.color,
    pickable: true,
    onClick: ({ object }) => {
      if (object) callbacks.onBuildingClick((object as ShellPiece).building)
    },
    updateTriggers: { getPolygon: tick, getFillColor: tick },
  })

  const platesLayer = new SolidPolygonLayer<ShellPiece>({
    id: 'floor-plates',
    data: plates,
    getPolygon: (d) => d.ring,
    extruded: true,
    getElevation: (d) => d.height,
    getFillColor: (d) => d.color,
    pickable: true,
    onClick: ({ object }) => {
      if (object) callbacks.onBuildingClick((object as ShellPiece).building)
    },
    updateTriggers: { getPolygon: tick },
  })

  const roomsLayer = new SolidPolygonLayer<RoomPiece>({
    id: 'rooms',
    data: rooms,
    getPolygon: (d) => d.ring,
    extruded: true,
    wireframe: true,
    getElevation: (d) => d.height,
    getFillColor: (d) => d.color,
    getLineColor: (d) => (d.classroom.id === selectedRoomId ? [14, 116, 144, 255] : [255, 255, 255, 180]),
    pickable: true,
    onClick: ({ object }) => {
      if (object) callbacks.onRoomClick((object as RoomPiece).classroom)
    },
    updateTriggers: { getPolygon: tick, getElevation: tick, getFillColor: tick, getLineColor: [tick, selectedRoomId] },
  })

  const visibleRooms = rooms.filter((r) => (explode[r.cell.buildingId] ?? 0) > 0.6)
  const roomLabelProps = {
    getPosition: (d: RoomPiece): [number, number, number] => [d.cell.labelAnchor[0], d.cell.labelAnchor[1], d.ring[0][2] + d.height + 1.2],
    getText: (d: RoomPiece) => {
      const lecture = getCurrentLecture(d.classroom.id, d.classroom.building)
      const now = lecture.status === 'live' ? lecture.subject : 'No class now'
      return `${d.classroom.room}\n${now}\n${d.classroom.present_count}/${d.classroom.capacity} present`
    },
    getSize: 11,
    sizeUnits: 'pixels' as const,
    getColor: [15, 23, 42, 255] as RGBA,
    background: true,
    backgroundPadding: [5, 3] as [number, number],
    getTextAnchor: 'middle' as const,
    getAlignmentBaseline: 'bottom' as const,
    lineHeight: 1.25,
    fontFamily: 'Geist Variable, system-ui, sans-serif',
    fontWeight: 600,
    billboard: true,
    // Labels sit between stacked floors; without this the slab above hides them.
    parameters: { depthTest: false },
  }

  const roomLabels = new TextLayer<RoomPiece>({
    ...roomLabelProps,
    id: 'room-labels',
    data: visibleRooms.filter((r) => r.classroom.id !== selectedRoomId),
    getBackgroundColor: [255, 255, 255, 230],
    updateTriggers: { getPosition: tick, getText: tick },
  })

  const selectedRoomLabel = new TextLayer<RoomPiece>({
    ...roomLabelProps,
    id: 'room-label-selected',
    data: visibleRooms.filter((r) => r.classroom.id === selectedRoomId),
    getBackgroundColor: [224, 242, 254, 250],
    updateTriggers: { getPosition: tick, getText: tick },
  })

  const floorLabelLayer = new TextLayer({
    id: 'floor-labels',
    data: floorLabels.filter((l) => l.alpha > 10),
    getPosition: (d) => d.position,
    getText: (d) => d.text,
    getSize: 12,
    sizeUnits: 'pixels',
    getColor: (d) => [51, 65, 85, d.alpha],
    getTextAnchor: 'end',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, system-ui, sans-serif',
    fontWeight: 700,
    billboard: true,
    // Labels sit between stacked floors; without this the slab above hides them.
    parameters: { depthTest: false },
    updateTriggers: { getPosition: tick, getColor: tick },
  })

  const buildingLabelLayer = new TextLayer({
    id: 'building-labels',
    data: buildingLabels.filter((l) => l.alpha > 10),
    getPosition: (d) => d.position,
    getText: (d) => d.text,
    getSize: 15,
    sizeUnits: 'pixels',
    getColor: (d) => [15, 23, 42, d.alpha],
    background: true,
    getBackgroundColor: (d) => [255, 255, 255, Math.round(d.alpha * 0.85)],
    backgroundPadding: [6, 3],
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, system-ui, sans-serif',
    fontWeight: 700,
    billboard: true,
    // Labels sit between stacked floors; without this the slab above hides them.
    parameters: { depthTest: false },
    updateTriggers: { getPosition: tick, getColor: tick, getBackgroundColor: tick },
  })

  return [
    lawnLayer,
    roadLayer,
    pathsLayer,
    lotsLayer,
    slotsLayer,
    carsLayer,
    trunksLayer,
    canopyLayer,
    shellLayer,
    platesLayer,
    roomsLayer,
    floorLabelLayer,
    roomLabels,
    selectedRoomLabel,
    buildingLabelLayer,
  ]
}
