import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { getTimetable, refreshTimetable, useTimetableVersion } from '@/components/map/lectureInfo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchClassrooms, type ClassroomOption } from '@/lib/checkIn'
import { deleteSlot, fetchGroups, groupKey, parseGroupKey, saveSlot, type Group } from '@/lib/mentorAcademics'
import { DAY_NAMES, fmtTime, groupLabel, STANDARD_PERIODS, toMinutes, type TimetableSlot } from '@/lib/timetable'
import { cn } from '@/lib/utils'

interface Draft {
  id: string | null
  day_of_week: number
  starts_at: string
  ends_at: string
  subject: string
  teacher: string
  classroom_id: string
}

export function TimetableEditorPage() {
  useTimetableVersion()
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState('')
  const [rooms, setRooms] = useState<ClassroomOption[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGroups()
      .then((g) => {
        setGroups(g)
        if (g.length) setSelected(groupKey(g[0]))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load class groups.'))
    fetchClassrooms().then(setRooms).catch(() => {})
  }, [])

  const group = selected ? parseGroupKey(selected) : null
  // Re-read on every render: useTimetableVersion() above re-renders this page
  // whenever the shared timetable store changes.
  const slots = group
    ? getTimetable().filter((s) => s.program === group.program && s.year === group.year && (s.section === group.section || s.section === null))
    : []

  const periodMap = new Map<string, { starts_at: string; ends_at: string }>()
  for (const p of STANDARD_PERIODS) periodMap.set(p.starts_at, p)
  for (const s of slots) if (!periodMap.has(s.starts_at)) periodMap.set(s.starts_at, { starts_at: s.starts_at, ends_at: s.ends_at })
  const periods = [...periodMap.values()].sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
  const days = slots.some((s) => s.day_of_week === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  const roomName = (id: string | null) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.buildingName} ${r.roomNumber}` : 'Room not set'
  }

  function openSlot(slot: TimetableSlot | null, day: number, period: { starts_at: string; ends_at: string }) {
    setError(null)
    setDraft(
      slot
        ? { id: slot.id, day_of_week: slot.day_of_week, starts_at: fmtTime(slot.starts_at), ends_at: fmtTime(slot.ends_at), subject: slot.subject, teacher: slot.teacher, classroom_id: slot.classroom_id ?? '' }
        : { id: null, day_of_week: day, starts_at: fmtTime(period.starts_at), ends_at: fmtTime(period.ends_at), subject: '', teacher: 'XYZ', classroom_id: '' },
    )
  }

  async function save() {
    if (!draft || !group) return
    if (!draft.subject.trim()) return setError('Enter a subject.')
    if (draft.ends_at <= draft.starts_at) return setError('The end time must be after the start time.')
    setBusy(true)
    setError(null)
    try {
      await saveSlot(draft.id, {
        program: group.program,
        year: group.year,
        section: group.section,
        day_of_week: draft.day_of_week,
        starts_at: `${draft.starts_at}:00`,
        ends_at: `${draft.ends_at}:00`,
        classroom_id: draft.classroom_id || null,
        subject: draft.subject,
        teacher: draft.teacher,
      })
      await refreshTimetable()
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this period.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!draft?.id) return
    setBusy(true)
    try {
      await deleteSlot(draft.id)
      await refreshTimetable()
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this period.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/dashboard" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 font-display text-xl font-semibold">Timetable</h1>
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Click a period to change its subject, teacher or room, or an empty cell to add one. Changes show on the map,
        the check-in screen and students' phones straight away.
      </p>

      <div className="mt-5">
        <Label htmlFor="group">Class</Label>
        <select
          id="group"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setDraft(null)
          }}
          className="mt-1.5 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {groups.length === 0 && <option value="">No students yet — import a roster first</option>}
          {groups.map((g) => (
            <option key={groupKey(g)} value={groupKey(g)}>
              {groupLabel(g)}
            </option>
          ))}
        </select>
      </div>
      {error && !draft && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {group && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="w-24 px-2 py-2 font-medium">Period</th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-2 font-medium">
                      {DAY_NAMES[d - 1]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.starts_at} className="border-t border-border align-top">
                    <td className="px-2 py-2 text-muted-foreground tabular-nums">
                      {fmtTime(p.starts_at)}
                      <br />
                      {fmtTime(p.ends_at)}
                    </td>
                    {days.map((d) => {
                      const slot = slots.find((s) => s.day_of_week === d && s.starts_at === p.starts_at)
                      const active = draft && (draft.id ? draft.id === slot?.id : draft.day_of_week === d && `${draft.starts_at}:00` === p.starts_at)
                      return (
                        <td key={d} className="p-1">
                          <button
                            type="button"
                            onClick={() => openSlot(slot ?? null, d, p)}
                            className={cn(
                              'flex min-h-14 w-full flex-col items-start rounded-md border px-2 py-1.5 text-left transition-colors',
                              active ? 'border-primary bg-accent' : slot ? 'border-border bg-card hover:border-primary/50' : 'border-dashed border-border text-muted-foreground hover:bg-accent/50',
                            )}
                          >
                            {slot ? (
                              <>
                                <span className="line-clamp-2 font-medium text-foreground">{slot.subject}</span>
                                <span className="text-[11px] text-muted-foreground">{slot.teacher}</span>
                                <span className="text-[11px] text-muted-foreground">{roomName(slot.classroom_id)}</span>
                              </>
                            ) : (
                              <Plus className="m-auto size-4" />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
            {!draft ? (
              <p className="text-sm text-muted-foreground">Select a period to edit it.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">
                  {draft.id ? 'Edit period' : 'New period'} · {DAY_NAMES[draft.day_of_week - 1]}
                </h2>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" className="mt-1" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="teacher">Teacher</Label>
                  <Input id="teacher" className="mt-1" value={draft.teacher} onChange={(e) => setDraft({ ...draft, teacher: e.target.value })} />
                  <p className="mt-1 text-[11px] text-muted-foreground">Leave as XYZ until the professor is confirmed.</p>
                </div>
                <div>
                  <Label htmlFor="room">Room</Label>
                  <select
                    id="room"
                    value={draft.classroom_id}
                    onChange={(e) => setDraft({ ...draft, classroom_id: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Not set</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.buildingName} — {r.roomNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="starts">Starts</Label>
                    <Input id="starts" type="time" className="mt-1" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ends">Ends</Label>
                    <Input id="ends" type="time" className="mt-1" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
                  </div>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={save} disabled={busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                    Cancel
                  </Button>
                  {draft.id && (
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove} disabled={busy}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
