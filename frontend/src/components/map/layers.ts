import { PolygonLayer, TextLayer } from '@deck.gl/layers'
import { BUILDINGS, type Building } from './campusData'
import { occupancyColor, squareRing, type ClassroomState, type MapState } from './mapState'

// Bus layer is intentionally NOT built here — see busBackup.ts for the
// preserved routes + restoration steps. Re-adding it means appending a
// ScatterplotLayer (prototype in map-demo/campus-map-demo.html) without
// touching anything below.

const PARKING_RING: [number, number][] = [
  [79.08776, 21.14568],
  [79.08835, 21.14568],
  [79.08835, 21.1459],
  [79.08776, 21.1459],
]

function ringCenter(ring: [number, number][]) {
  const [lng, lat] = ring.reduce<[number, number]>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  return [lng / ring.length, lat / ring.length] as [number, number]
}

export function classroomPct(classroom: Pick<ClassroomState, 'present_count' | 'capacity'>): number {
  if (classroom.capacity <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((100 * classroom.present_count) / classroom.capacity)))
}

export interface MapLayerCallbacks {
  onBuildingClick: (building: Building) => void
  onClassroomClick: (classroom: ClassroomState) => void
}

// `tick` busts deck.gl's attribute cache: state arrays are mutated in place
// (same reference), so every live accessor needs an updateTrigger — same
// pattern as map-demo/campus-map-demo.html, otherwise the map looks frozen.
export function buildLayers(
  state: MapState,
  callbacks: MapLayerCallbacks,
  tick: number,
  selectedClassroomId?: string,
) {
  const buildingsLayer = new PolygonLayer<Building>({
    id: 'buildings',
    data: BUILDINGS,
    getPolygon: (building) => building.ring,
    extruded: true,
    getElevation: (building) => building.height,
    getFillColor: [71, 85, 105, 220],
    getLineColor: [148, 163, 184, 255],
    lineWidthMinPixels: 1,
    pickable: true,
    onClick: ({ object }) => {
      if (object) callbacks.onBuildingClick(object as Building)
    },
  })

  const buildingLabels = new TextLayer<Building>({
    id: 'building-labels',
    data: BUILDINGS,
    getPosition: (building) => ringCenter(building.ring),
    getText: (building) => building.shortLabel,
    getColor: [226, 232, 240, 255],
    getSize: 18,
    sizeUnits: 'pixels',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, sans-serif',
    fontWeight: 700,
    billboard: true,
    pickable: false,
  })

  const classroomsLayer = new PolygonLayer<ClassroomState>({
    id: 'classrooms',
    data: state.classrooms,
    // Bars rise out of the roof (z = 14) so occupancy reads as spikes above
    // the building, not walls competing with it.
    getPolygon: (classroom) => squareRing(classroom.lng, classroom.lat, 0.00003, 14),
    extruded: true,
    getElevation: (classroom) => 1 + (classroomPct(classroom) / 100) * 20,
    getFillColor: (classroom) => [...occupancyColor(classroomPct(classroom)), 230] as [number, number, number, number],
    getLineColor: (classroom) =>
      classroom.id === selectedClassroomId ? [56, 189, 248, 255] : [15, 23, 42, 200],
    lineWidthMinPixels: 1,
    pickable: true,
    onClick: ({ object }) => {
      if (object) callbacks.onClassroomClick(object as ClassroomState)
    },
    updateTriggers: {
      getElevation: tick,
      getFillColor: tick,
      getLineColor: [tick, selectedClassroomId ?? 'none'],
    },
  })

  const classroomLabels = new TextLayer<ClassroomState>({
    id: 'classroom-labels',
    data: state.classrooms,
    getPosition: (classroom) => {
      const top = 14 + 1 + (classroomPct(classroom) / 100) * 20
      return [classroom.lng, classroom.lat, top + 1.5]
    },
    getText: (classroom) => classroom.room,
    getColor: [226, 232, 240, 255],
    getSize: 12,
    sizeUnits: 'pixels',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, sans-serif',
    fontWeight: 600,
    billboard: true,
    pickable: false,
    updateTriggers: { getPosition: tick },
  })

  const parkingLayer = new PolygonLayer({
    id: 'parking',
    data: [{ ring: PARKING_RING, occupied: state.parking.filter((spot) => spot.occupied).length, total: state.parking.length }],
    getPolygon: (parking) => parking.ring,
    getFillColor: [254, 243, 199, 200],
    getLineColor: [148, 163, 184, 255],
    lineWidthMinPixels: 1,
    pickable: true,
  })

  const parkingLabel = new TextLayer({
    id: 'parking-label',
    data: [{ position: ringCenter(PARKING_RING), label: 'PARKING' }],
    getPosition: (parking) => parking.position,
    getText: (parking) => parking.label,
    getColor: [226, 232, 240, 255],
    getSize: 13,
    sizeUnits: 'pixels',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, sans-serif',
    fontWeight: 700,
    billboard: true,
    pickable: false,
  })

  return [buildingsLayer, buildingLabels, classroomsLayer, classroomLabels, parkingLayer, parkingLabel]
}
