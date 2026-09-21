import { PolygonLayer, TextLayer } from '@deck.gl/layers'
import { BUILDINGS, type Building } from './campusData'
import type { MapState } from './mapState'

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

export function buildLayers(state: MapState, onBuildingClick: (building: Building) => void) {
  const buildingsLayer = new PolygonLayer<Building>({
    id: 'buildings',
    data: BUILDINGS,
    getPolygon: (building) => building.ring,
    extruded: true,
    getElevation: (building) => building.height,
    getFillColor: [255, 255, 255, 235],
    getLineColor: [15, 23, 42, 255],
    lineWidthMinPixels: 2,
    pickable: true,
    onClick: ({ object }) => {
      if (object) onBuildingClick(object)
    },
  })

  const buildingLabels = new TextLayer<Building>({
    id: 'building-labels',
    data: BUILDINGS,
    getPosition: (building) => ringCenter(building.ring),
    getText: (building) => building.shortLabel,
    getColor: [15, 23, 42, 255],
    getSize: 18,
    sizeUnits: 'pixels',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, sans-serif',
    fontWeight: 700,
    billboard: true,
    pickable: false,
  })

  const parkingLayer = new PolygonLayer({
    id: 'parking',
    data: [{ ring: PARKING_RING, occupied: state.parking.filter((spot) => spot.occupied).length, total: state.parking.length }],
    getPolygon: (parking) => parking.ring,
    getFillColor: [254, 243, 199, 235],
    getLineColor: [15, 23, 42, 255],
    lineWidthMinPixels: 2,
    pickable: true,
  })

  const parkingLabel = new TextLayer({
    id: 'parking-label',
    data: [{ position: ringCenter(PARKING_RING), label: 'PARKING' }],
    getPosition: (parking) => parking.position,
    getText: (parking) => parking.label,
    getColor: [15, 23, 42, 255],
    getSize: 13,
    sizeUnits: 'pixels',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    fontFamily: 'Space Grotesk Variable, sans-serif',
    fontWeight: 700,
    billboard: true,
    pickable: false,
  })

  return [buildingsLayer, buildingLabels, parkingLayer, parkingLabel]
}
