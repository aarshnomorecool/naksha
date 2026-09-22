import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { fetchTodaySummary, subscribeTodayAttendance, type TodaySummary } from '@/lib/liveAttendance'
import {
  fetchMentorRoster,
  LIVE_BAND_META,
  ROSTER_WINDOW_DAYS,
  type LiveBand,
  type RosterStudent,
} from '@/lib/mentorRoster'
import { cn } from '@/lib/utils'

type BandFilter = LiveBand | 'all'

const BAND_ORDER: Record<LiveBand, number> = {
  needs_attention: 0,
  watching: 1,
  on_track: 2,
  no_data: 3,
}

const BAND_FILTERS: { id: BandFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'watching', label: 'Watching' },
  { id: 'on_track', label: 'On track' },
  { id: 'no_data', label: 'No data' },
]

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Defaulter rule: attendance below 75% over the 14-day window. Respects the
// mentor's current filters (search, program, year, section) — what you see is
// what gets exported. Students with no data are never exported as defaulters.
const DEFAULTER_CUTOFF = 75

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function exportDefaultersCsv(rows: RosterStudent[]) {
  const defaulters = rows.filter(
    (s) => s.attendancePct !== null && s.attendancePct < DEFAULTER_CUTOFF,
  )
  const header = ['Roll number', 'Name', 'Program', 'Year', 'Section', `Days present (${ROSTER_WINDOW_DAYS}d)`, 'Attendance %', 'Band']
  const lines = defaulters.map((s) =>
    [
      s.roll_number,
      s.full_name,
      s.program,
      String(s.year),
      s.section ?? '',
      String(s.presentDays),
      String(s.attendancePct ?? ''),
      LIVE_BAND_META[s.band].label,
    ]
      .map(escapeCsvCell)
      .join(','),
  )
  const blob = new Blob([[header.map(escapeCsvCell).join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `naksha-defaulters-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function DashboardListPage() {
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [bandFilter, setBandFilter] = useState<BandFilter>('all')
  const [programFilter, setProgramFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [today, setToday] = useState<TodaySummary | null>(null)

  const loadRoster = () => {
    fetchMentorRoster()
      .then(setRoster)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load students.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadRoster, [])

  // Live refresh: every check-in (kiosk or phone QR) re-reads today's feed
  // AND the roster bands, so the list never goes stale.
  useEffect(() => {
    let cancelled = false
    const refreshToday = () => {
      fetchTodaySummary()
        .then((summary) => {
          if (!cancelled) setToday(summary)
        })
        .catch(() => {})
    }
    refreshToday()
    const unsubscribe = subscribeTodayAttendance(() => {
      refreshToday()
      fetchMentorRoster()
        .then((rows) => {
          if (!cancelled) setRoster(rows)
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const programs = useMemo(() => [...new Set(roster.map((s) => s.program))].sort(), [roster])
  const years = useMemo(() => [...new Set(roster.map((s) => s.year))].sort((a, b) => a - b), [roster])
  const sections = useMemo(
    () =>
      [...new Set(roster.map((s) => s.section).filter((s): s is string => !!s))].sort(),
    [roster],
  )

  const counts = useMemo(() => {
    const c: Record<LiveBand, number> = { needs_attention: 0, watching: 0, on_track: 0, no_data: 0 }
    for (const s of roster) c[s.band] += 1
    return c
  }, [roster])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roster
      .filter((s) => {
        if (bandFilter !== 'all' && s.band !== bandFilter) return false
        if (programFilter !== 'all' && s.program !== programFilter) return false
        if (yearFilter !== 'all' && s.year !== Number(yearFilter)) return false
        if (sectionFilter !== 'all' && s.section !== sectionFilter) return false
        if (!q) return true
        return s.full_name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q)
      })
      .sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band] || (a.attendancePct ?? 101) - (b.attendancePct ?? 101))
  }, [roster, query, bandFilter, programFilter, yearFilter, sectionFilter])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-semibold">Mentor dashboard</h1>
        {!loading && !error && roster.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {roster.length} students · {counts.needs_attention} need attention
          </p>
        )}
      </div>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat label="Checked in today" value={today?.total} />
          <Stat label="Classrooms active" value={today?.roomsActive} />
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
        {today && today.recent.length > 0 && (
          <ul className="mt-3 grid gap-x-6 gap-y-1 border-t border-border pt-3 sm:grid-cols-2">
            {today.recent.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  <span className="font-medium">{c.student_name}</span>{' '}
                  <span className="text-muted-foreground">{c.roll_number}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {c.room_number} · {new Date(c.check_in_time).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!loading && !error && roster.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or roll number"
            className="lg:max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            <ScopeSelect value={programFilter} onChange={setProgramFilter} label="Program" options={programs} allLabel="All programs" />
            <ScopeSelect value={yearFilter} onChange={setYearFilter} label="Year" options={years.map(String)} allLabel="All years" />
            <ScopeSelect value={sectionFilter} onChange={setSectionFilter} label="Section" options={sections} allLabel="All sections" />
          </div>
          <div className="flex flex-wrap gap-1.5 lg:ml-auto">
            {BAND_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setBandFilter(f.id)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  bandFilter === f.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => exportDefaultersCsv(filtered)}
              disabled={filtered.every((s) => s.attendancePct === null || s.attendancePct >= DEFAULTER_CUTOFF)}
              className="rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              title={`Download CSV of the listed students below ${DEFAULTER_CUTOFF}% attendance`}
            >
              Export defaulters ({filtered.filter((s) => s.attendancePct !== null && s.attendancePct < DEFAULTER_CUTOFF).length})
            </button>
          </div>
        </div>
      )}

      {loading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
      {!loading && !error && roster.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No students found — add rows to the students table in Supabase.
        </p>
      )}
      {!loading && !error && roster.length > 0 && filtered.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No students match these filters.</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {filtered.map((s) => {
          const meta = LIVE_BAND_META[s.band]
          return (
            <Link
              key={s.id}
              to={`/dashboard/${s.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:bg-accent"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: meta.dot }}
              >
                {initials(s.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{s.full_name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{s.roll_number}</span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {s.program} · Yr {s.year}{s.section ? ` · Sec ${s.section}` : ''}
                </span>
                {s.attendancePct !== null ? (
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${s.attendancePct}%`, background: meta.dot }}
                      />
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{s.attendancePct}%</span>
                  </span>
                ) : (
                  <span className="mt-1 block text-[11px] text-muted-foreground">No check-ins in {ROSTER_WINDOW_DAYS} days</span>
                )}
              </span>
              <Badge className={cn('shrink-0', meta.badgeClass)}>{meta.label}</Badge>
            </Link>
          )
        })}
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground">
        Bands are computed live from the last {ROSTER_WINDOW_DAYS} days of attendance and refresh on every
        check-in. Trained model scores (XGBoost + SHAP) will replace this heuristic later.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-2xl font-semibold tabular-nums">{value ?? '–'}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  )
}

function ScopeSelect({
  value,
  onChange,
  label,
  options,
  allLabel,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: string[]
  allLabel: string
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
