import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
// maplibre-gl's own CSS is imported in main.tsx, BEFORE index.css/Tailwind —
// see the comment there for why the order matters.

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { hasSupabaseConfig } from '@/lib/supabase'
import { CAMPUS_CENTER } from './campusData'
import { buildLayers } from './layers'
import { createSimulatedState, jitterOccupancy, jitterParking, stepBuses, type MapState } from './mapState'
import { subscribeSupabaseData } from './useSupabaseData'

// Ported from map-demo/campus-map-demo.html. Runs in simulation mode by
// default (zero configuration needed); if VITE_SUPABASE_URL/ANON_KEY are set
// (see src/lib/supabase.ts), it wires the live Realtime subscriptions from
// useSupabaseData.ts instead. See that file / the standalone demo for the
// full data-flow explanation.
export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      // No tile server: base style is a single solid-color background layer,
      // zero external dependency that can fail mid-demo.
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }],
      },
      center: CAMPUS_CENTER,
      zoom: 17.2,
      pitch: 45,
      bearing: -20,
      antialias: true,
    })

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null
        if (layer.id === 'classrooms') {
          return { html: `<b>${object.building} — ${object.room}</b><br/>Occupancy: ${object.occupancy_pct}% of ${object.capacity}` }
        }
        if (layer.id === 'buses') {
          return { html: `<b>${object.label}</b><br/>${object.route_name}` }
        }
        if (layer.id === 'parking') {
          return { html: `<b>${object.lot_name}</b><br/>${object.occupied ? 'Occupied' : 'Free'}` }
        }
        if (layer.id === 'buildings') {
          return { html: `<b>${object.name}</b>` }
        }
        return null
      },
    })

    // deck.gl 8.x's IControl/Map types predate this maplibre-gl version's
    // typings — runtime compatibility is fine (this is the documented
    // deck.gl + maplibre-gl integration pattern), the cast is type-only.
    map.addControl(overlay as unknown as maplibregl.IControl)

    const state: MapState = createSimulatedState()
    const renderLayers = () => overlay.setProps({ layers: buildLayers(state) })
    map.on('load', renderLayers)

    let cleanupSupabase = () => {}
    let rafId = 0
    // Typed as plain `number` (not ReturnType<typeof window.setInterval>):
    // @types/node's global setInterval typing leaks into this compilation
    // and returns NodeJS.Timeout, which the actual browser call disagrees with.
    let occupancyInterval: number | undefined
    let parkingInterval: number | undefined

    if (hasSupabaseConfig) {
      cleanupSupabase = subscribeSupabaseData(state, renderLayers)
    } else {
      let lastFrame = performance.now()
      const tick = (now: number) => {
        const dt = (now - lastFrame) / 1000
        lastFrame = now
        stepBuses(state, dt)
        renderLayers()
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      occupancyInterval = window.setInterval(() => {
        jitterOccupancy(state)
        renderLayers()
      }, 4000)
      parkingInterval = window.setInterval(() => {
        jitterParking(state)
        renderLayers()
      }, 3500)
    }

    return () => {
      cleanupSupabase()
      if (rafId) cancelAnimationFrame(rafId)
      if (occupancyInterval !== undefined) window.clearInterval(occupancyInterval)
      if (parkingInterval !== undefined) window.clearInterval(parkingInterval)
      map.remove()
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      {/* Inline style, not the Tailwind `absolute inset-0` classes: maplibre-gl
          adds its own `maplibregl-map` class here, and that stylesheet's
          unlayered `.maplibregl-map { position: relative }` rule always beats
          Tailwind's utilities (Tailwind wraps them in `@layer utilities` —
          per the CSS cascade-layers spec, ANY unlayered rule beats a layered
          one regardless of source order). Inline styles are the one thing
          that reliably wins over both. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <Badge className="absolute top-4 left-4 z-10 rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase">
        {hasSupabaseConfig ? 'Live feed' : 'Simulated feed for demo'}
      </Badge>

      <div className="absolute top-4 right-4 z-10 text-right text-gray-200">
        <div className="text-base font-bold tracking-wide">NAKSHA</div>
        <div className="text-xs text-gray-400">Campus Map Prototype</div>
      </div>

      <Card className="absolute bottom-4 left-4 z-10 min-w-[190px] border-gray-700 bg-gray-900/85 text-gray-200">
        <CardContent className="text-xs">
          <h3 className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase">Classroom occupancy</h3>
          <div className="flex items-center gap-3">
            <LegendSwatch color="#22c55e" label="Low" />
            <LegendSwatch color="#f59e0b" label="Medium" />
            <LegendSwatch color="#ef4444" label="High" />
          </div>
          <div className="mt-1 text-gray-400">height also scales with occupancy</div>

          <h3 className="mt-3 mb-1 text-[11px] tracking-wide text-gray-400 uppercase">Live layers</h3>
          <div className="flex flex-col gap-1">
            <LegendSwatch color="#3b82f6" label="Buses" />
            <LegendSwatch color="#22c55e" label="Parking free" />
            <LegendSwatch color="#ef4444" label="Parking occupied" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}
