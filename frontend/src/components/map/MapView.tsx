import { useCallback, useEffect, useRef, useState } from 'react'
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import { Clock, Layers3, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { hasSupabaseConfig } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { BUILDINGS, CAMPUS_CENTER, type Building } from './campusData'
import { distanceMeters, floorCount, rectCenter, ringBounds } from './campusGeometry'
import { buildLayers, classroomPct, type RoomPiece, type ShellPiece } from './layers'
import { getCurrentLecture, onTimetableChange } from './lectureInfo'
import { createInitialState, occupancyColor, type ClassroomState, type MapState } from './mapState'
import { subscribeSupabaseData } from './useSupabaseData'

// Zoom past OPEN_ZOOM and the building nearest the screen centre opens into a
// cutaway; zoom back out past CLOSE_ZOOM and it closes. The gap stops it
// flickering at the boundary.
const OPEN_ZOOM = 18.8
const CLOSE_ZOOM = 18.3
// Centre on everything drawn (buildings + car parks sit south of
// CAMPUS_CENTER), not just the seed's nominal centre point.
const campusExtent = BUILDINGS.map((b) => ringBounds(b.ring))
const OVERVIEW = {
  center: [
    (Math.min(...campusExtent.map((r) => r.minLng)) + Math.max(...campusExtent.map((r) => r.maxLng))) / 2,
    CAMPUS_CENTER[1] - 0.0003,
  ] as [number, number],
  zoom: 17.6,
  pitch: 55,
  bearing: -20,
}
const EXPLODE_MS = 650

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.85 }),
  sun: new DirectionalLight({ color: [255, 244, 226], intensity: 1.25, direction: [-1, -2, -3] }),
  sky: new DirectionalLight({ color: [205, 220, 255], intensity: 0.45, direction: [2, 1, -1] }),
})

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function rgb(c: [number, number, number]) {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state] = useState<MapState>(() => createInitialState())
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | undefined>()
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>()
  const [, setVersion] = useState(0)

  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const explodeRaw = useRef<Record<string, number>>({})
  const targetRef = useRef<string | undefined>(undefined)
  const roomRef = useRef<string | undefined>(undefined)
  const frameRef = useRef(0)
  const rafRef = useRef(0)
  const flyingRef = useRef(false)
  const reduceMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const render = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const eased: Record<string, number> = {}
    for (const [id, t] of Object.entries(explodeRaw.current)) eased[id] = easeInOut(t)
    frameRef.current += 1
    overlay.setProps({
      layers: buildLayers({
        state,
        tick: frameRef.current,
        explode: eased,
        selectedRoomId: roomRef.current,
        callbacks: {
          onBuildingClick: (b) => selectBuildingRef.current(b.id, true),
          onRoomClick: (c) => selectRoomRef.current(c.id),
        },
      }),
    })
  }, [state])

  const animate = useCallback(() => {
    if (rafRef.current) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      let moving = false
      for (const b of BUILDINGS) {
        const target = b.id === targetRef.current ? 1 : 0
        const raw = explodeRaw.current[b.id] ?? 0
        if (raw === target) continue
        const next = reduceMotion.current
          ? target
          : Math.min(1, Math.max(0, raw + (target > raw ? 1 : -1) * (dt / EXPLODE_MS)))
        explodeRaw.current[b.id] = next
        if (next !== target) moving = true
      }
      render()
      rafRef.current = moving ? requestAnimationFrame(step) : 0
    }
    rafRef.current = requestAnimationFrame(step)
  }, [render])

  const selectBuilding = useCallback(
    (id: string | undefined, fly: boolean) => {
      const map = mapRef.current
      if (id !== targetRef.current) {
        targetRef.current = id
        roomRef.current = undefined
        setSelectedBuildingId(id)
        setSelectedRoomId(undefined)
        animate()
      }
      if (!fly || !map) return
      flyingRef.current = true
      map.once('moveend', () => {
        flyingRef.current = false
      })
      const duration = reduceMotion.current ? 0 : 1400
      if (id) {
        const b = BUILDINGS.find((x) => x.id === id)!
        map.flyTo({ center: rectCenter(ringBounds(b.ring)), zoom: 19.2, pitch: 68, duration, essential: true })
      } else {
        map.flyTo({ ...OVERVIEW, duration, essential: true })
      }
    },
    [animate],
  )

  const selectRoom = useCallback(
    (id: string | undefined) => {
      roomRef.current = id
      setSelectedRoomId(id)
      render()
    },
    [render],
  )

  // deck's onClick callbacks are created once per render() call; route them
  // through refs so they always hit the latest selection logic.
  const selectBuildingRef = useRef(selectBuilding)
  const selectRoomRef = useRef(selectRoom)
  selectBuildingRef.current = selectBuilding
  selectRoomRef.current = selectRoom

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dde3d8' } }],
      },
      ...OVERVIEW,
      maxPitch: 72,
      antialias: true,
    })
    mapRef.current = map

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      effects: [lighting],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null
        const style = { background: 'rgba(15,23,42,0.92)', color: '#f8fafc', fontSize: '12px', borderRadius: '6px', padding: '6px 8px' }
        if (layer.id === 'rooms') {
          const c = (object as RoomPiece).classroom
          const lecture = getCurrentLecture(c.id, c.building)
          return {
            html: `<b>${c.room}</b> · Floor ${c.floor}<br/>${lecture.status === 'live' ? `${lecture.subject}, ${lecture.teacher}` : 'No class now'}<br/>${c.present_count}/${c.capacity} present`,
            style,
          }
        }
        if (layer.id === 'building-shell' || layer.id === 'floor-plates') {
          const b = (object as ShellPiece).building
          return { html: `<b>${b.name}</b><br/>Click to see inside`, style }
        }
        return null
      },
    })
    overlayRef.current = overlay
    map.addControl(overlay as unknown as maplibregl.IControl)
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', render)
    const offTimetable = onTimetableChange(render)
    map.on('moveend', () => {
      if (flyingRef.current) return
      const zoom = map.getZoom()
      if (zoom >= OPEN_ZOOM) {
        const center = map.getCenter()
        const nearest = BUILDINGS.map((b) => ({ b, d: distanceMeters([center.lng, center.lat], rectCenter(ringBounds(b.ring))) }))
          .sort((x, y) => x.d - y.d)[0]
        if (nearest && nearest.d < 80) selectBuildingRef.current(nearest.b.id, false)
      } else if (zoom < CLOSE_ZOOM && targetRef.current) {
        selectBuildingRef.current(undefined, false)
      }
    })

    const bump = () => {
      render()
      setVersion((v) => v + 1)
    }

    // No simulation fallback: without a configured database the map shows
    // the campus with nobody present and a "Not connected" badge.
    const cleanupSupabase = subscribeSupabaseData(state, bump)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && targetRef.current) selectBuildingRef.current(undefined, true)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      offTimetable()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      cleanupSupabase()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [render, state])

  const building = selectedBuildingId ? BUILDINGS.find((b) => b.id === selectedBuildingId) : undefined

  return (
    <div className="relative h-full w-full bg-[#dde3d8]">
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <span
        className={cn(
          'absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow',
          hasSupabaseConfig ? 'bg-emerald-600' : 'bg-red-600',
        )}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        {hasSupabaseConfig ? 'Live' : 'Not connected'}
      </span>

      {!building && (
        <div className="absolute bottom-4 left-4 z-10 w-[250px] rounded-lg border border-black/5 bg-white/90 p-3 text-xs text-slate-700 shadow-lg backdrop-blur">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Layers3 className="size-3.5 text-sky-700" />
            Zoom in or click a building
          </p>
          <p className="mt-1 text-slate-600">Its floors open up to show every classroom and the class running now.</p>
          <div className="mt-2.5 flex items-center gap-2">
            <span>Students present</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, ${rgb(occupancyColor(0))}, ${rgb(occupancyColor(50))}, ${rgb(occupancyColor(100))})` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between pl-[92px] text-[10px] text-slate-500">
            <span>Few</span>
            <span>Full</span>
          </div>
        </div>
      )}

      {building && (
        <BuildingPanel
          building={building}
          classrooms={state.classrooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={selectRoom}
          onClose={() => selectBuilding(undefined, true)}
        />
      )}
    </div>
  )
}

function BuildingPanel({
  building,
  classrooms,
  selectedRoomId,
  onSelectRoom,
  onClose,
}: {
  building: Building
  classrooms: ClassroomState[]
  selectedRoomId?: string
  onSelectRoom: (id: string) => void
  onClose: () => void
}) {
  const rooms = classrooms.filter((c) => c.building === building.name)
  const floors = floorCount(building, classrooms)
  const present = rooms.reduce((s, c) => s + c.present_count, 0)
  const capacity = rooms.reduce((s, c) => s + c.capacity, 0)

  return (
    <aside className="absolute top-4 right-14 bottom-4 z-10 flex w-[330px] max-w-[calc(100%-5rem)] flex-col overflow-hidden rounded-xl border border-black/5 bg-white/95 text-slate-900 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <p className="text-xs font-semibold text-sky-700">{building.shortLabel}</p>
          <h2 className="font-display text-lg leading-tight font-semibold">{building.name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {floors} floor{floors === 1 ? '' : 's'}
            {capacity > 0 && (
              <>
                {' '}
                · <span className="font-semibold text-slate-800 tabular-nums">{present}</span> of {capacity} seats in use
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close building"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => {
          const floorRooms = rooms
            .filter((c) => c.floor === floor)
            .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
          return (
            <section key={floor} className="mb-3">
              <h3 className="px-1 pb-1 text-xs font-semibold text-slate-500">Floor {floor}</h3>
              {floorRooms.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                  No classrooms on this floor
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {floorRooms.map((c) => {
                    const lecture = getCurrentLecture(c.id, c.building)
                    const pct = classroomPct(c)
                    const active = c.id === selectedRoomId
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelectRoom(c.id)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                            active ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{c.room}</span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              <span className="font-semibold text-slate-800">{c.present_count}</span>/{c.capacity}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                            {lecture.status === 'live' ? (
                              <>
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                <span className="truncate">{lecture.subject}</span>
                              </>
                            ) : (
                              <span className="truncate text-slate-400">
                                {lecture.status === 'break' ? `Next: ${lecture.subject}` : 'No more classes today'}
                              </span>
                            )}
                          </span>
                          {active && lecture.status !== 'done' && (
                            <span className="mt-1.5 block text-xs text-slate-500">
                              {lecture.teacher}
                              <span className="mt-0.5 flex items-center gap-1">
                                <Clock className="size-3" />
                                {lecture.timeSlot}
                              </span>
                            </span>
                          )}
                          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: rgb(occupancyColor(pct)) }}
                            />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <div className="border-t border-slate-200 p-3">
        <Link
          to={`/map/building/${building.id}`}
          className="block rounded-md border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open full floor plan
        </Link>
      </div>
    </aside>
  )
}
