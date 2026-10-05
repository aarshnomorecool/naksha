import { useEffect, useMemo, useRef, useState } from 'react'
import { EllipsisVertical, MessageSquare, TrendingDown, TrendingUp } from 'lucide-react'

import { getTimetable, useTimetableVersion } from '@/components/map/lectureInfo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { startOfMonth, subjectsToFocus, summarizeAttendance, summarizeMarks } from '@/lib/attendanceStats'
import { fetchStudentAcademics, markMessagesRead, resetStudentData, type StudentAcademics } from '@/lib/mentorAcademics'
import { indiaNow, slotsForGroup } from '@/lib/timetable'
import { cn } from '@/lib/utils'

function barColor(pct: number) {
  return pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
}

export function StudentAcademicsCards({ studentId, refreshKey }: { studentId: string; refreshKey: number }) {
  useTimetableVersion()
  const [data, setData] = useState<StudentAcademics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchStudentAcademics(studentId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        const unread = d.messages.filter((m) => !m.read_at).map((m) => m.id)
        void markMessagesRead(unread).catch(() => {})
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load marks and subjects.'))
    return () => {
      cancelled = true
    }
  }, [studentId, refreshKey])

  const now = indiaNow()
  const slots = data ? slotsForGroup(getTimetable(), data.student) : []
  const from = data ? (startOfMonth(now.dateIso) > data.student.tracking_since ? startOfMonth(now.dateIso) : data.student.tracking_since) : now.dateIso
  const month = data ? summarizeAttendance(slots, data.attendance, from, now.dateIso, now.minutes) : null
  const marks = useMemo(() => (data ? summarizeMarks(data.marks) : []), [data])
  const focus = month ? subjectsToFocus(month, marks) : []

  if (error) return <p className="mb-4 text-sm text-destructive">{error}</p>
  if (!data || !month) return null

  return (
    <>
      {focus.length > 0 && (
        <Card className="mb-4 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base">Subjects to focus on</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {focus.map((f) => (
                <li key={f.subject} className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{f.subject}</span>
                  <span className="text-xs text-muted-foreground">{f.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance by subject</CardTitle>
            <p className="text-xs text-muted-foreground">
              This month · {month.overall.pct === null ? 'no classes yet' : `${month.overall.pct}% overall (${month.overall.attended}/${month.overall.expected})`}
            </p>
          </CardHeader>
          <CardContent>
            {month.bySubject.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timetabled classes yet this month.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {month.bySubject.map((s) => (
                  <li key={s.subject}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{s.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        <span className="font-semibold text-foreground">{s.pct ?? 0}%</span> · {s.attended}/{s.expected}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', barColor(s.pct ?? 0))} style={{ width: `${Math.max(2, s.pct ?? 0)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marks</CardTitle>
          </CardHeader>
          <CardContent>
            {marks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exam results yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {marks.map((m) => (
                  <li key={m.subject} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.subject}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{m.exams.map((e) => `${e.pct}%`).join(' → ')}</div>
                    </div>
                    {m.deltaPct !== null && (
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums',
                          m.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {m.deltaPct >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                        {m.deltaPct >= 0 ? '+' : ''}
                        {m.deltaPct}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {data.messages.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <MessageSquare className="size-4 text-primary" />
              Messages from this student
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {data.messages.map((m) => (
                <li key={m.id} className="text-sm">
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

const RESET_COPY = {
  baseline: {
    label: 'Clear baseline',
    title: 'Clear baseline data?',
    body: "Removes the generated starting attendance and marks. Real check-ins and real exam scores stay. Attendance is then measured from when this student was added.",
  },
  all: {
    label: 'Start fresh',
    title: 'Delete all attendance and marks?',
    body: "Deletes every check-in and every exam score for this student, real ones included. Attendance starts again from today. This can't be undone.",
  },
} as const

export function ResetMenu({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<'baseline' | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirm(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function run(mode: 'baseline' | 'all') {
    setBusy(true)
    setError(null)
    try {
      await resetStudentData(studentId, mode)
      setOpen(false)
      setConfirm(null)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" aria-label="Student data options" onClick={() => setOpen((o) => !o)}>
        <EllipsisVertical className="size-4" />
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {confirm === null ? (
            <>
              <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">Reset attendance and marks</p>
              {(['baseline', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setConfirm(mode)}
                  className={cn(
                    'w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent',
                    mode === 'all' && 'text-destructive',
                  )}
                >
                  {RESET_COPY[mode].label}
                </button>
              ))}
            </>
          ) : (
            <div className="p-2">
              <p className="text-sm font-semibold">{RESET_COPY[confirm].title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{RESET_COPY[confirm].body}</p>
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant={confirm === 'all' ? 'destructive' : 'default'} size="sm" onClick={() => run(confirm)} disabled={busy}>
                  {busy ? 'Working…' : RESET_COPY[confirm].label}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
