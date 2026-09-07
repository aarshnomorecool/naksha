import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { BUILDINGS } from './campusData'
import { occupancyColor, squareRing, type MapState } from './mapState'

export function buildLayers(state: MapState) {
  // deck.gl only recomputes GPU attributes when the `data` array reference
  // changes or an updateTrigger value changes — since state.classrooms/
  // buses/parking are mutated in place (same array reference every call),
  // every per-frame-changing accessor below needs an updateTrigger, or the
  // layer will render its first frame and then appear visually frozen even
  // though the simulation is still running underneath.
  const now = performance.now()

  const buildingsLayer = new PolygonLayer({
    id: 'buildings',
    data: BUILDINGS,
    getPolygon: (d) => d.ring,
    extruded: true,
    getElevation: (d) => d.height,
    getFillColor: [71, 85, 105, 200],
    getLineColor: [148, 163, 184, 255],
    lineWidthMinPixels: 1,
    pickable: true,
  })

  const classroomsLayer = new PolygonLayer({
    id: 'classrooms',
    data: state.classrooms,
    // base ring sits at z = building roof height (14) so occupancy bars read
    // as spikes rising out of the roof, not competing with the building walls
    getPolygon: (d) => squareRing(d.lng, d.lat, 0.00003, 14),
    extruded: true,
    getElevation: (d) => 1 + (d.occupancy_pct / 100) * 20,
    getFillColor: (d) => [...occupancyColor(d.occupancy_pct), 230],
    pickable: true,
    updateTriggers: { getElevation: now, getFillColor: now },
  })

  const busesLayer = new ScatterplotLayer({
    id: 'buses',
    data: state.buses,
    getPosition: (d) => d.position,
    getRadius: 6,
    radiusUnits: 'pixels',
    getFillColor: [59, 130, 246, 255],
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 1.5,
    stroked: true,
    pickable: true,
    updateTriggers: { getPosition: now },
  })

  const parkingLayer = new ScatterplotLayer({
    id: 'parking',
    data: state.parking,
    getPosition: (d) => [d.lng, d.lat],
    getRadius: 3.5,
    radiusUnits: 'pixels',
    getFillColor: (d) => (d.occupied ? [239, 68, 68, 255] : [34, 197, 94, 255]),
    pickable: true,
    updateTriggers: { getFillColor: now },
  })

  return [buildingsLayer, classroomsLayer, parkingLayer, busesLayer]
}
