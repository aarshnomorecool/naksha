import { useEffect, useRef, useState } from 'react'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import { Clock, DoorOpen, UsersRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { hasSupabaseConfig } from '@/lib/supabase'
import { CAMPUS_CENTER } from './campusData'
import { buildLayers, classroomPct } from './layers'
import { getCurrentLecture } from './lectureInfo'
import { createSimulatedState, jitterClassroomPresence, jitterParking, type MapState } from './mapState'
import { subscribeSupabaseData } from './useSupabaseData'

function occupancyBarColor(pct: number): string {
  if (pct >= 75) return '#ef4444'
  if (pct >= 40) return '#f59e0b'
  return '#22c55e'
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [initialState] = useState<MapState>(() => createSimulatedState())
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [tick, setTick] = useState(0)
  const selectedIdRef = useRef<string | undefined>(undefined)
  const tickRef = useRef(0)
  const renderRef = useRef(() => {})

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }],
      },
      center: CAMPUS_CENTER,
      zoom: 17.6,
      pitch: 55,
      bearing: -20,
      antialias: true,
    })

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null
        if (layer.id === 'classrooms') {
          const pct = classroomPct(object)
          return {
            html: `<b>${object.building} — ${object.room}</b><br/>${object.present_count}/${object.capacity} present (${pct}%)<br/><em>Click for lecture details</em>`,
          }
        }
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

    const renderLayers = () => {
      overlay.setProps({
        layers: buildLayers(
          initialState,
          {
            onBuildingClick: (building) => navigate(`/map/building/${building.id}`),
            onClassroomClick: (classroom) => {
              selectedIdRef.current = classroom.id
              setSelectedId(classroom.id)
            },
          },
          tickRef.current,
          selectedIdRef.current,
        ),
      })
    }
    renderRef.current = renderLayers
    const bump = () => {
      tickRef.current = performance.now()
      setTick(tickRef.current)
      renderLayers()
    }

    map.on('load', renderLayers)

    let cleanupSupabase = () => {}
    let classroomInterval: number | undefined
    let parkingInterval: number | undefined

    if (hasSupabaseConfig) {
      cleanupSupabase = subscribeSupabaseData(initialState, bump)
    } else {
      classroomInterval = window.setInterval(() => {
        jitterClassroomPresence(initialState)
        bump()
      }, 4000)
      parkingInterval = window.setInterval(() => {
        jitterParking(initialState)
        bump()
      }, 3500)
    }

    return () => {
      cleanupSupabase()
      if (classroomInterval !== undefined) window.clearInterval(classroomInterval)
      if (parkingInterval !== undefined) window.clearInterval(parkingInterval)
      map.remove()
    }
    // initialState is a stable mutated-in-place object; navigate is stable.
    // selectedId/tick are mirrored via refs so the deck callbacks stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Re-render the deck highlight when selection changes (covers the Close
  // button, which lives outside deck's click handling).
  useEffect(() => {
    selectedIdRef.current = selectedId
    renderRef.current()
  }, [selectedId])

  const selected = selectedId ? initialState.classrooms.find((c) => c.id === selectedId) : undefined
  // `tick` is read here so the popup's present-count refreshes on every
  // simulation / realtime update even though `initialState` is mutated in place.
  void tick
  const lecture = selected ? getCurrentLecture(selected.id, selected.building) : undefined
  const selectedPct = selected ? classroomPct(selected) : 0

  return (
    <div className="relative h-full w-full bg-[#0b1220]">
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <Badge
        className={`absolute top-4 left-4 z-10 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase ${
          hasSupabaseConfig ? 'bg-emerald-600' : 'bg-red-600'
        }`}
      >
        {hasSupabaseConfig ? 'Live feed' : 'Simulated feed for demo'}
      </Badge>

      <div className="absolute top-4 right-4 z-10 text-right">
        <div className="text-base font-bold tracking-wide text-slate-100">NAKSHA</div>
        <div className="text-xs text-slate-400">College live map</div>
      </div>

      <Card className="absolute bottom-4 left-4 z-10 min-w-[225px] border-white/10 bg-slate-900/90 text-slate-100 shadow-lg">
        <CardContent className="text-xs">
          <h3 className="mb-1 text-[11px] tracking-wide text-slate-400 uppercase">Campus guide</h3>
          <p className="text-slate-300">Click a class block to see its lecture. Click a building for floors.</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <LegendSwatch color="#22c55e" label="Low" />
            <LegendSwatch color="#f59e0b" label="Medium" />
            <LegendSwatch color="#ef4444" label="High" />
            <LegendSwatch color="#475569" label="Building" />
            <LegendSwatch color="#fef3c7" label="Parking" />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Bar height also scales with occupancy.</p>
        </CardContent>
      </Card>

      {selected && lecture && (
        <Card className="absolute right-4 bottom-4 z-10 w-[300px] border-white/10 bg-slate-900/95 text-slate-100 shadow-xl">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-300 uppercase">
                  {selected.building}
                </p>
                <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
                  <DoorOpen className="size-5 text-sky-300" />
                  {selected.room}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">Floor {selected.floor}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close class details"
                onClick={() => setSelectedId(undefined)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-4 rounded-lg bg-white/5 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Now</p>
              <p className="mt-1 text-sm font-semibold">{lecture.subject}</p>
              <p className="mt-0.5 text-xs text-slate-400">{lecture.teacher}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-300">
                <Clock className="size-3.5 text-sky-300" />
                {lecture.timeSlot}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    lecture.status === 'live'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {lecture.status === 'live' ? 'Live now' : lecture.status === 'break' ? 'Break' : 'Done'}
                </span>
              </p>
            </div>

            <div className="mt-4 rounded-lg bg-white/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                <UsersRound className="size-3.5 text-sky-300" />
                Attendance
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {selected.present_count}
                <span className="text-sm font-normal text-slate-400"> / {selected.capacity}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${selectedPct}%`, background: occupancyBarColor(selectedPct) }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">{selectedPct}% occupied</p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-4 w-full"
              onClick={() => {
                const buildingId =
                  selected.building === 'Main Academic Block'
                    ? 'main-academic'
                    : selected.building === 'Computer Science Block'
                      ? 'cs-block'
                      : 'library'
                navigate(`/map/building/${buildingId}`)
              }}
            >
              View floor plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-300">
      <span className="inline-block h-2.5 w-2.5 rounded-sm border border-white/20" style={{ background: color }} />
      {label}
    </span>
  )
}
