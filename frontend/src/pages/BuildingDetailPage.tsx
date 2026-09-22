import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Building2, Clock, DoorOpen, UsersRound } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { BUILDINGS, CLASSROOMS } from '@/components/map/campusData'
import { getCurrentLecture } from '@/components/map/lectureInfo'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ClassroomPresence {
  id: string
  room: string
  floor: number
  capacity: number
  presentCount: number
}

interface ClassroomRow {
  id: string
  room_number: string
  floor: number
  capacity: number
  current_occupancy: number
  buildings: { name: string } | null
}

function demoPresentCount(id: string, capacity: number) {
  const seed = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0)
  return Math.round(capacity * (0.32 + (seed % 42) / 100))
}

function useBuildingClassrooms(buildingName: string | undefined) {
  const demoClassrooms = useMemo<ClassroomPresence[]>(
    () => CLASSROOMS
      .filter((classroom) => classroom.building === buildingName)
      .map((classroom) => ({
        id: classroom.id,
        room: classroom.room,
        floor: classroom.floor,
        capacity: classroom.capacity,
        presentCount: demoPresentCount(classroom.id, classroom.capacity),
      })),
    [buildingName],
  )
  const [classrooms, setClassrooms] = useState<ClassroomPresence[]>(demoClassrooms)

  useEffect(() => {
    setClassrooms(demoClassrooms)
    if (!buildingName || !supabase) return

    let cancelled = false
    const client = supabase
    const loadClassrooms = async () => {
      const { data } = await client
        .from('classrooms')
        .select('id, room_number, floor, capacity, current_occupancy, buildings(name)')
        .returns<ClassroomRow[]>()
      if (cancelled || !data) return
      setClassrooms(data
        .filter((classroom) => classroom.buildings?.name === buildingName)
        .map((classroom) => ({
          id: classroom.id,
          room: classroom.room_number,
          floor: classroom.floor,
          capacity: classroom.capacity,
          presentCount: classroom.current_occupancy,
        })))
    }

    loadClassrooms()
    const channel = client
      .channel(`building-classrooms-${buildingName}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classrooms' }, loadClassrooms)
      .subscribe()

    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [buildingName, demoClassrooms])

  return classrooms
}

export function BuildingDetailPage() {
  const { buildingId } = useParams()
  const building = BUILDINGS.find((item) => item.id === buildingId)
  const classrooms = useBuildingClassrooms(building?.name)
  const floors = useMemo(() => [...new Set(classrooms.map((classroom) => classroom.floor))].sort((first, second) => first - second), [classrooms])
  const [activeFloor, setActiveFloor] = useState<number | undefined>(floors[0])
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | undefined>()

  useEffect(() => {
    setActiveFloor(floors[0])
    setSelectedClassroomId(undefined)
  }, [buildingId, floors])

  const floorClassrooms = classrooms.filter((classroom) => classroom.floor === activeFloor)
  const selectedClassroom = floorClassrooms.find((classroom) => classroom.id === selectedClassroomId) ?? floorClassrooms[0]
  const totalPresent = classrooms.reduce((total, classroom) => total + classroom.presentCount, 0)

  if (!building) return <Navigate to="/map" replace />

  return (
    <div className="min-h-full bg-[#202126] text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <Link to="/map" className="inline-flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white">
          <ArrowLeft className="size-4" />
          Back to college live map
        </Link>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-5 border-b border-white/15 pb-7">
          <div>
            <p className="text-sm font-semibold tracking-[0.16em] text-sky-300 uppercase">{building.shortLabel}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{building.name}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">Choose a floor and a classroom to see the current number of students present.</p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-slate-200">
            {hasSupabaseConfig ? 'Live attendance feed' : 'Simulated feed for demo'}
          </span>
        </div>

        {classrooms.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-white/20 px-6 py-12 text-center text-slate-300">
            No classrooms are configured for this building yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="rounded-xl border border-white/12 bg-[#292a30] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Classrooms</p>
                  <p className="mt-1 text-xs text-slate-400">Select a floor, then select a class.</p>
                </div>
                <Building2 className="size-5 text-sky-300" />
              </div>

              <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Building floors">
                {floors.map((floor) => (
                  <button
                    key={floor}
                    type="button"
                    role="tab"
                    aria-selected={activeFloor === floor}
                    className={cn(
                      'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                      activeFloor === floor
                        ? 'border-sky-300 bg-sky-300 text-slate-950'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10',
                    )}
                    onClick={() => {
                      setActiveFloor(floor)
                      setSelectedClassroomId(undefined)
                    }}
                  >
                    Floor {floor}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {floorClassrooms.map((classroom) => {
                  const lecture = building ? getCurrentLecture(classroom.id, building.name) : undefined
                  return (
                    <button
                      key={classroom.id}
                      type="button"
                      className={cn(
                        'rounded-lg border p-4 text-left transition-colors',
                        selectedClassroom?.id === classroom.id
                          ? 'border-sky-300 bg-sky-300/10'
                          : 'border-white/10 bg-[#222329] hover:border-white/25',
                      )}
                      onClick={() => setSelectedClassroomId(classroom.id)}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 font-semibold"><DoorOpen className="size-4 text-sky-300" />{classroom.room}</span>
                        <span className="text-xs text-slate-400">Capacity {classroom.capacity}</span>
                      </span>
                      {lecture && (
                        <span className="mt-2 block truncate text-xs text-slate-300">
                          {lecture.subject} · {lecture.teacher}
                        </span>
                      )}
                      <span className="mt-3 block text-2xl font-semibold tabular-nums">{classroom.presentCount}</span>
                      <span className="text-xs text-slate-400">students present</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <aside className="rounded-xl border border-white/12 bg-[#292a30] p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">Selected class</p>
              {selectedClassroom && (() => {
                const lecture = building ? getCurrentLecture(selectedClassroom.id, building.name) : undefined
                return (
                  <>
                    <h2 className="mt-4 flex items-center gap-2 font-display text-2xl font-semibold"><DoorOpen className="size-5 text-sky-300" />{selectedClassroom.room}</h2>
                    <p className="mt-1 text-sm text-slate-400">Floor {selectedClassroom.floor}</p>
                    {lecture && (
                      <div className="mt-5 rounded-lg bg-[#202126] p-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                          <BookOpen className="size-4 text-sky-300" /> Now
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-100">{lecture.subject}</p>
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
                    )}
                    <div className="mt-4 rounded-lg bg-[#202126] p-4">
                      <UsersRound className="size-5 text-sky-300" />
                      <p className="mt-4 text-4xl font-semibold tabular-nums">{selectedClassroom.presentCount}</p>
                      <p className="mt-1 text-sm text-slate-300">students present</p>
                      <p className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">Capacity: {selectedClassroom.capacity} students</p>
                    </div>
                  </>
                )
              })()}
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="text-xs text-slate-400 uppercase">Building total</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{totalPresent} students present</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
