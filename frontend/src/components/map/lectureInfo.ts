// "What's running in this room right now", read from the timetable table
// (supabase/migrations/0008_timetable_marks.sql). Teachers stay 'XYZ' until a
// mentor edits the slot — no real or invented names live in the code.
//
// The timetable is loaded once into a small shared store and kept fresh via
// realtime, so synchronous callers (map layers, tooltips) can ask per room
// without each fetching. Components re-render through useTimetableVersion().

import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { EARLY_CHECKIN_MINUTES, fetchTimetable, indiaNow, slotLabel, toMinutes, type TimetableSlot } from '@/lib/timetable'

export interface CurrentLecture {
  subject: string
  teacher: string
  timeSlot: string
  // live = a period is running now; break = between periods / before the
  // first; done = after the last period today (or no classes today).
  status: 'live' | 'break' | 'done'
}

let slots: TimetableSlot[] = []
let version = 0
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  version += 1
  for (const l of listeners) l()
}

async function reload() {
  try {
    slots = await fetchTimetable()
  } catch {
    // Keep the last good copy; callers fall back to "no class now".
  }
  notify()
}

export function loadTimetable(): Promise<void> {
  if (loading) return loading
  loading = reload()
  if (supabase) {
    supabase
      .channel('timetable-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetable' }, () => void reload())
      .subscribe()
  }
  return loading
}

// Force a reload right after a local edit instead of waiting for realtime.
export function refreshTimetable(): Promise<void> {
  void loadTimetable()
  return reload()
}

export function onTimetableChange(listener: () => void): () => void {
  void loadTimetable()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTimetableVersion(): number {
  return useSyncExternalStore(onTimetableChange, () => version)
}

export function getTimetable(): TimetableSlot[] {
  return slots
}

export function getCurrentLecture(classroomId: string, _building?: string, at: Date = new Date()): CurrentLecture {
  void loadTimetable()
  const now = indiaNow(at)
  const today = slots
    .filter((s) => s.classroom_id === classroomId && s.day_of_week === now.dow)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))

  const live = today.find(
    (s) => now.minutes >= toMinutes(s.starts_at) - EARLY_CHECKIN_MINUTES && now.minutes < toMinutes(s.ends_at),
  )
  if (live) {
    return { subject: live.subject, teacher: live.teacher, timeSlot: slotLabel(live), status: 'live' }
  }
  const next = today.find((s) => toMinutes(s.starts_at) > now.minutes)
  if (next) {
    return { subject: next.subject, teacher: next.teacher, timeSlot: slotLabel(next), status: 'break' }
  }
  return { subject: '', teacher: '', timeSlot: '', status: 'done' }
}
