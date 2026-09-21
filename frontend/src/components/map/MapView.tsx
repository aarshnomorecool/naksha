import { useEffect, useRef } from 'react'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { hasSupabaseConfig } from '@/lib/supabase'
import { CAMPUS_CENTER } from './campusData'
import { buildLayers } from './layers'
import { createSimulatedState, jitterClassroomPresence, jitterParking, type MapState } from './mapState'
import { subscribeSupabaseData } from './useSupabaseData'

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e5e7eb' } }],
      },
      center: CAMPUS_CENTER,
      zoom: 17.2,
      pitch: 40,
      bearing: 0,
      antialias: true,
    })

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null
        if (layer.id === 'parking') {
          return { html: `<b>Parking</b><br/>${object.occupied} of ${object.total} spaces in use` }
        }
        if (layer.id === 'buildings') {
          return { html: `<b>${object.shortLabel}</b><br/>${object.name}<br/><em>Click to view floors and classes</em>` }
        }
        return null
      },
    })

    map.addControl(overlay as unknown as maplibregl.IControl)

    const state: MapState = createSimulatedState()
    const renderLayers = () => overlay.setProps({ layers: buildLayers(state, (building) => navigate(`/map/building/${building.id}`)) })
    map.on('load', renderLayers)

    let cleanupSupabase = () => {}
    let classroomInterval: number | undefined
    let parkingInterval: number | undefined

    if (hasSupabaseConfig) {
      cleanupSupabase = subscribeSupabaseData(state, renderLayers)
    } else {
      classroomInterval = window.setInterval(() => {
        jitterClassroomPresence(state)
        renderLayers()
      }, 4000)
      parkingInterval = window.setInterval(() => {
        jitterParking(state)
        renderLayers()
      }, 3500)
    }

    return () => {
      cleanupSupabase()
      if (classroomInterval !== undefined) window.clearInterval(classroomInterval)
      if (parkingInterval !== undefined) window.clearInterval(parkingInterval)
      map.remove()
    }
  }, [navigate])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <Badge className="absolute top-4 left-4 z-10 rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase">
        {hasSupabaseConfig ? 'Live feed' : 'Simulated feed for demo'}
      </Badge>

      <div className="absolute top-4 right-4 z-10 text-right text-slate-800">
        <div className="text-base font-bold tracking-wide">NAKSHA</div>
        <div className="text-xs text-slate-600">College live map</div>
      </div>

      <Card className="absolute bottom-4 left-4 z-10 min-w-[225px] border-slate-300 bg-white/90 text-slate-900 shadow-lg">
        <CardContent className="text-xs">
          <h3 className="mb-1 text-[11px] tracking-wide text-slate-500 uppercase">Campus guide</h3>
          <p className="text-slate-700">Select a building to view floors, classrooms, and students present.</p>
          <div className="mt-3 flex items-center gap-3">
            <LegendSwatch color="#ffffff" label="Building" />
            <LegendSwatch color="#fef3c7" label="Parking" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300" style={{ background: color }} />
      {label}
    </span>
  )
}
