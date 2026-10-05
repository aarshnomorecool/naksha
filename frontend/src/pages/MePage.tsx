import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleAlert, MessageSquare, RefreshCw, Smartphone, TrendingDown, TrendingUp } from 'lucide-react'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import {
  startOfMonth,
  startOfWeek,
  subjectsToFocus,
  summarizeAttendance,
  summarizeMarks,
  type SubjectMarks,
  type Tally,
} from '@/lib/attendanceStats'
import { asTimetableSlots, fetchMyDashboard, sendMentorMessage, type SendStatus, type StudentDashboard } from '@/lib/studentDashboard'
import { hasSupabaseConfig } from '@/lib/supabase'
import { addDays, DAY_NAMES, indiaNow, isoDow, slotLabel, toMinutes } from '@/lib/timetable'
import { cn } from '@/lib/utils'

type Load = { kind: 'loading' } | { kind: 'not_linked' } | { kind: 'error'; message: string } | { kind: 'ready'; data: StudentDashboard }

// Public page. The phone linked at the student's first QR check-in is their
// identity (no password); the server only ever returns that student's data.
export function MePage() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  const refresh = useCallback(() => {
    fetchMyDashboard()
      .then((res) => setLoad(res.ok ? { kind: 'ready', data: res.data } : { kind: 'not_linked' }))
      .catch((e: unknown) =>
        setLoad({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't load your attendance." }),
      )
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoad({ kind: 'error', message: "The attendance service isn't configured on this site copy." })
      return
    }
    refresh()
  }, [refresh])

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BrandMark className="h-5 w-5 text-primary" />
          <span className="font-display text-sm font-semibold tracking-tight text-foreground">My attendance</span>
        </div>
        {load.kind === 'ready' && (
          <Button variant="ghost" size="sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </Button>
        )}
      </div>

      {load.kind === 'loading' && <p className="text-sm text-muted-foreground">Loading your attendance…</p>}

      {load.kind === 'not_linked' && (
        <div className="rounded-lg border border-border bg-card p-5">
          <Smartphone className="size-6 text-primary" />
          <h1 className="mt-3 font-display text-lg font-semibold">This phone isn't linked yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan the QR code shown in your class once and enter your roll number. After that, this page shows
            your attendance and marks.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Already linked? Open this page in the same browser you used for that first scan (for example Chrome,
            not the camera app's built-in browser).
          </p>
        </div>
      )}

      {load.kind === 'error' && (
        <div className="rounded-lg border border-border bg-card p-5 text-sm">
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            {load.message}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {load.kind === 'ready' && <Dashboard data={load.data} onSent={refresh} />}
    </div>
  )
}

function Dashboard({ data, onSent }: { data: StudentDashboard; onSent: () => void }) {
  const now = indiaNow()
  const today = data.today
  const slots = useMemo(() => asTimetableSlots(data), [data])
  const from = (start: string) => (start > data.tracking_since ? start : data.tracking_since)

  const todaySum = summarizeAttendance(slots, data.attendance, today, today, now.minutes)
  const weekSum = summarizeAttendance(slots, data.attendance, from(startOfWeek(today)), today, now.minutes)
  const monthSum = summarizeAttendance(slots, data.attendance, from(startOfMonth(today)), today, now.minutes)
  const marks = useMemo(() => summarizeMarks(data.marks), [data.marks])
  const focus = subjectsToFocus(monthSum, marks)

  const s = data.student
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{s.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          {s.roll_number} · {s.program} · Year {s.year}
          {s.section ? ` · Section ${s.section}` : ''}
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Kpi label="Today" tally={todaySum.overall} />
        <Kpi label="This week" tally={weekSum.overall} />
        <Kpi label="This month" tally={monthSum.overall} />
      </section>

      <TodayCard data={data} nowMinutes={now.minutes} />

      {focus.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold">Subjects to focus on</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {focus.map((f) => (
              <li key={f.subject} className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{f.subject}</span>
                <span className="text-xs text-muted-foreground">{f.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Your mentor can help — send them a message below.</p>
        </section>
      )}

      <MonthCalendar todayIso={today} trackingSince={data.tracking_since} byDay={monthSum.byDay} />

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Attendance by subject</h2>
        <p className="text-xs text-muted-foreground">This month</p>
        {monthSum.bySubject.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No classes counted yet this month.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {monthSum.bySubject.map((sub) => (
              <li key={sub.subject}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{sub.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{sub.pct ?? 0}%</span> · {sub.attended}/{sub.expected}
                  </span>
                </div>
                <Bar pct={sub.pct ?? 0} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <MarksCard marks={marks} />

      <MessageCard data={data} onSent={onSent} />
    </div>
  )
}

function Kpi({ label, tally }: { label: string; tally: Tally }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{tally.pct === null ? '—' : `${tally.pct}%`}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {tally.expected === 0 ? 'No classes yet' : `${tally.attended} of ${tally.expected} classes`}
      </div>
    </div>
  )
}

function barColor(pct: number) {
  return pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', barColor(pct))} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  )
}

function TodayCard({ data, nowMinutes }: { data: StudentDashboard; nowMinutes: number }) {
  const dow = isoDow(data.today)
  const periods = data.timetable
    .filter((t) => t.day_of_week === dow)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
  const checkins = new Map(
    data.attendance.filter((a) => a.session_date === data.today && a.timetable_id).map((a) => [a.timetable_id!, a]),
  )

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Today · {DAY_NAMES[dow - 1]}</h2>
      {periods.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No classes scheduled today.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {periods.map((p) => {
            const hit = checkins.get(p.id)
            const start = toMinutes(p.starts_at)
            const end = toMinutes(p.ends_at)
            const status = hit
              ? { text: `Checked in ${new Date(hit.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, tone: 'text-emerald-600 dark:text-emerald-400' }
              : nowMinutes >= start - 10 && nowMinutes < end
                ? { text: 'Now · scan the code', tone: 'text-primary font-semibold' }
                : nowMinutes >= end
                  ? { text: 'Missed', tone: 'text-red-600 dark:text-red-400' }
                  : { text: 'Upcoming', tone: 'text-muted-foreground' }
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {slotLabel(p)}
                    {p.room_number ? ` · ${p.building_name ?? ''} ${p.room_number}`.trimEnd() : ''} · {p.teacher}
                  </div>
                </div>
                <span className={cn('shrink-0 text-xs', status.tone)}>{status.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MonthCalendar({
  todayIso,
  trackingSince,
  byDay,
}: {
  todayIso: string
  trackingSince: string
  byDay: Map<string, { attended: number; expected: number }>
}) {
  const first = startOfMonth(todayIso)
  const lead = isoDow(first) - 1
  const days: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d)

  const cellClass = (d: string) => {
    if (d > todayIso) return 'border border-dashed border-border text-muted-foreground'
    if (d < trackingSince) return 'bg-muted/50 text-muted-foreground'
    const s = byDay.get(d)
    if (!s || s.expected === 0) return 'bg-muted text-muted-foreground'
    if (s.attended === s.expected) return 'bg-emerald-500 text-white'
    if (s.attended > 0) return 'bg-amber-500 text-white'
    return 'bg-red-500 text-white'
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">
        {new Date(`${first}T12:00:00Z`).toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      </h2>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
        {DAY_NAMES.map((d) => (
          <div key={d} className="pb-1 text-muted-foreground">
            {d.slice(0, 1)}
          </div>
        ))}
        {days.map((d, i) =>
          d ? (
            <div
              key={d}
              title={byDay.get(d) ? `${byDay.get(d)!.attended}/${byDay.get(d)!.expected} classes` : undefined}
              className={cn('flex aspect-square items-center justify-center rounded-md tabular-nums', cellClass(d), d === todayIso && 'ring-2 ring-primary ring-offset-1 ring-offset-card')}
            >
              {Number(d.slice(8))}
            </div>
          ) : (
            <div key={`pad-${i}`} />
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <Legend className="bg-emerald-500" label="All classes" />
        <Legend className="bg-amber-500" label="Some" />
        <Legend className="bg-red-500" label="None" />
        <Legend className="bg-muted" label="No classes" />
      </div>
    </section>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-block size-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 72
  const h = 22
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function MarksCard({ marks }: { marks: SubjectMarks[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Marks</h2>
      {marks.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No exam results yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {marks.map((m) => {
            const latest = m.exams[m.exams.length - 1]
            return (
              <li key={m.subject} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {latest.exam}: <span className="font-semibold text-foreground tabular-nums">{latest.score}</span>/{latest.max}
                    {m.exams.length > 1 && <> · {m.exams.map((e) => `${e.pct}%`).join(' → ')}</>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-primary">
                  <Sparkline values={m.exams.map((e) => e.pct)} />
                  {m.deltaPct !== null && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
                        m.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {m.deltaPct >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                      {m.deltaPct >= 0 ? '+' : ''}
                      {m.deltaPct}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const SEND_MESSAGES: Record<Exclude<SendStatus, 'sent'>, string> = {
  not_linked: "This phone isn't linked to you any more. Scan your class QR again.",
  empty: 'Write a message first.',
  too_long: 'Keep it under 1000 characters.',
  rate_limited: "You've sent 5 messages in the last day. Your mentor will reply; try again tomorrow.",
}

function MessageCard({ data, onSent }: { data: StudentDashboard; onSent: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setNote(null)
    try {
      const status = await sendMentorMessage(body)
      if (status === 'sent') {
        setBody('')
        setNote({ ok: true, text: 'Sent to your mentor.' })
        onSent()
      } else {
        setNote({ ok: false, text: SEND_MESSAGES[status] })
      }
    } catch {
      setNote({ ok: false, text: "Couldn't send. Check your connection and try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="size-4 text-primary" />
        Message my mentor
      </h2>
      <form onSubmit={send} className="mt-2 flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Ask for help, explain an absence, or anything else."
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground tabular-nums">{body.length}/1000</span>
          <Button type="submit" size="sm" disabled={!body.trim() || busy}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
        {note && <p className={cn('text-xs', note.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>{note.text}</p>}
      </form>
      {data.messages.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {data.messages.map((m) => (
            <li key={m.created_at} className="text-sm">
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(m.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {m.read_at ? 'Seen by mentor' : 'Not seen yet'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
