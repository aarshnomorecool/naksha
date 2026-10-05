import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'

import { getTimetable, useTimetableVersion } from '@/components/map/lectureInfo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createExam,
  fetchExamMarks,
  fetchExams,
  fetchGroups,
  fetchGroupStudents,
  groupKey,
  parseGroupKey,
  saveExamMarks,
  type Exam,
  type Group,
  type GroupStudent,
} from '@/lib/mentorAcademics'
import { groupLabel, indiaNow, slotsForGroup } from '@/lib/timetable'
import { cn } from '@/lib/utils'

export function MarksPage() {
  useTimetableVersion()
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState('')
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchGroups()
      .then((g) => {
        setGroups(g)
        if (g.length) setSelected(groupKey(g[0]))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load class groups.'))
  }, [])

  const group = selected ? parseGroupKey(selected) : null

  useEffect(() => {
    if (!selected) return
    setExamId(null)
    fetchExams(parseGroupKey(selected))
      .then(setExams)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load exams.'))
  }, [selected])

  const subjects = group ? [...new Set(slotsForGroup(getTimetable(), group).map((s) => s.subject))].sort() : []
  const exam = exams.find((e) => e.id === examId) ?? null

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/dashboard" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 font-display text-xl font-semibold">Marks</h1>
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Add an exam for a class, then enter scores. Students see each new result next to their earlier ones, with the
        change since last time.
      </p>

      <div className="mt-5">
        <Label htmlFor="group">Class</Label>
        <select
          id="group"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
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
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {group && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="flex flex-col gap-2">
            <Button variant={creating ? 'secondary' : 'default'} onClick={() => setCreating((c) => !c)}>
              {creating ? 'Close' : 'Add exam'}
            </Button>
            {creating && (
              <NewExamForm
                group={group}
                subjects={subjects}
                onCreated={(e) => {
                  setExams((list) => [e, ...list])
                  setExamId(e.id)
                  setCreating(false)
                }}
              />
            )}
            {exams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exams for this class yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {exams.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setExamId(e.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        e.id === examId ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-accent/50',
                      )}
                    >
                      <span className="block font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.subject} · {e.exam_date} · out of {e.max_marks}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section>
            {exam ? (
              <ScoreSheet key={exam.id} exam={exam} group={group} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Select an exam to enter or review scores.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function NewExamForm({ group, subjects, onCreated }: { group: Group; subjects: string[]; onCreated: (e: Exam) => void }) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState(subjects[0] ?? '')
  const [date, setDate] = useState(indiaNow().dateIso)
  const [max, setMax] = useState('100')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const maxMarks = Number(max)
    if (!name.trim() || !subject.trim()) return setError('Enter an exam name and subject.')
    if (!(maxMarks > 0)) return setError('Maximum marks must be more than 0.')
    setBusy(true)
    setError(null)
    try {
      onCreated(await createExam({ name, subject, exam_date: date, max_marks: maxMarks, ...group }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the exam.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3">
      <div>
        <Label htmlFor="exam-name">Exam name</Label>
        <Input id="exam-name" className="mt-1" placeholder="e.g. Unit Test 2" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="exam-subject">Subject</Label>
        <Input id="exam-subject" className="mt-1" list="exam-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <datalist id="exam-subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="exam-date">Date</Label>
          <Input id="exam-date" type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="exam-max">Out of</Label>
          <Input id="exam-max" type="number" min={1} className="mt-1" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Creating…' : 'Create exam'}
      </Button>
    </form>
  )
}

function ScoreSheet({ exam, group }: { exam: Exam; group: Group }) {
  const [students, setStudents] = useState<GroupStudent[]>([])
  const [saved, setSaved] = useState<Map<string, number>>(new Map())
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Keyed on the group's value, not the object: the parent rebuilds `group` on
  // every render, and refetching here would wipe scores being typed.
  const key = groupKey(group)
  useEffect(() => {
    Promise.all([fetchGroupStudents(parseGroupKey(key)), fetchExamMarks(exam.id)])
      .then(([list, marks]) => {
        setStudents(list)
        setSaved(marks)
        setEntries(Object.fromEntries(list.map((s) => [s.id, marks.has(s.id) ? String(marks.get(s.id)) : ''])))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load scores.'))
      .finally(() => setLoading(false))
  }, [exam.id, key])

  const invalid = students.filter((s) => {
    const v = entries[s.id]?.trim()
    if (!v) return false
    const n = Number(v)
    return Number.isNaN(n) || n < 0 || n > exam.max_marks
  })
  const changed = students.filter((s) => {
    const v = entries[s.id]?.trim() ?? ''
    const before = saved.has(s.id) ? String(saved.get(s.id)) : ''
    return v !== before
  })
  const scores = students
    .map((s) => entries[s.id]?.trim() ?? '')
    .filter((v) => v !== '' && !Number.isNaN(Number(v)))
    .map(Number)
  const average = scores.length ? Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 10 : null

  async function save() {
    if (invalid.length || changed.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const map = new Map<string, number | null>(
        changed.map((s) => {
          const v = entries[s.id].trim()
          return [s.id, v === '' ? null : Number(v)]
        }),
      )
      await saveExamMarks(exam.id, map)
      const next = new Map(saved)
      for (const [id, v] of map) {
        if (v === null) next.delete(id)
        else next.set(id, v)
      }
      setSaved(next)
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save scores.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading scores…</p>

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-semibold">
            {exam.name} · {exam.subject}
          </h2>
          <p className="text-xs text-muted-foreground">
            {exam.exam_date} · out of {exam.max_marks} · {scores.length}/{students.length} entered
            {average !== null && ` · class average ${average}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && changed.length === 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="size-3.5" /> Saved {savedAt}
            </span>
          )}
          <Button size="sm" onClick={save} disabled={busy || invalid.length > 0 || changed.length === 0}>
            {busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}
          </Button>
        </div>
      </div>
      {invalid.length > 0 && (
        <p className="px-4 pt-3 text-xs text-destructive">Scores must be between 0 and {exam.max_marks}.</p>
      )}
      {error && <p className="px-4 pt-3 text-xs text-destructive">{error}</p>}
      {students.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No students in this class.</p>
      ) : (
        <ul className="divide-y divide-border">
          {students.map((s) => {
            const bad = invalid.includes(s)
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <Link to={`/dashboard/${s.id}`} className="min-w-0 text-sm hover:underline">
                  <span className="font-medium">{s.full_name}</span>{' '}
                  <span className="text-xs text-muted-foreground">{s.roll_number}</span>
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    aria-label={`Score for ${s.full_name}`}
                    inputMode="decimal"
                    className={cn('h-8 w-20 text-right tabular-nums', bad && 'border-destructive')}
                    value={entries[s.id] ?? ''}
                    onChange={(e) => setEntries((m) => ({ ...m, [s.id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground">/ {exam.max_marks}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
