import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { fetchRiskList, RISK_BAND_META, type RiskBand, type RiskListRow } from '@/lib/riskDashboard'
import { cn } from '@/lib/utils'

type BandFilter = RiskBand | 'all'

const FILTERS: { id: BandFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'watching', label: 'Watching' },
  { id: 'on_track', label: 'On track' },
]

export function DashboardListPage() {
  const [rows, setRows] = useState<RiskListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [bandFilter, setBandFilter] = useState<BandFilter>('all')

  useEffect(() => {
    fetchRiskList()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load risk scores.'))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(
    () => ({
      needs_attention: rows.filter((r) => r.risk_band === 'needs_attention').length,
      watching: rows.filter((r) => r.risk_band === 'watching').length,
      on_track: rows.filter((r) => r.risk_band === 'on_track').length,
    }),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (bandFilter !== 'all' && row.risk_band !== bandFilter) return false
      if (!q) return true
      return (
        row.student.full_name.toLowerCase().includes(q) ||
        row.student.roll_number.toLowerCase().includes(q)
      )
    })
  }, [rows, query, bandFilter])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <h1 className="font-display text-xl font-semibold">Mentor dashboard</h1>
        <p className="text-sm text-muted-foreground">Students sorted by priority — highest first.</p>
      </div>

      <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Placeholder scores: heuristically derived from seeded attendance history, not a trained model yet
        (XGBoost + SHAP is build-order step 4 in the project spec).
      </p>

      {!loading && !error && rows.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatTile
            count={counts.needs_attention}
            label="Needs attention"
            dot={RISK_BAND_META.needs_attention.dot}
            active={bandFilter === 'needs_attention'}
            onClick={() => setBandFilter((f) => (f === 'needs_attention' ? 'all' : 'needs_attention'))}
          />
          <StatTile
            count={counts.watching}
            label="Watching"
            dot={RISK_BAND_META.watching.dot}
            active={bandFilter === 'watching'}
            onClick={() => setBandFilter((f) => (f === 'watching' ? 'all' : 'watching'))}
          />
          <StatTile
            count={counts.on_track}
            label="On track"
            dot={RISK_BAND_META.on_track.dot}
            active={bandFilter === 'on_track'}
            onClick={() => setBandFilter((f) => (f === 'on_track' ? 'all' : 'on_track'))}
          />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or roll number"
            className="sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
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
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No risk scores yet — run supabase/seed_risk.sql in the Supabase SQL editor.
        </p>
      )}
      {!loading && !error && rows.length > 0 && filteredRows.length === 0 && (
        <p className="text-sm text-muted-foreground">No students match this search or filter.</p>
      )}

      <div className="flex flex-col gap-2">
        {filteredRows.map((row) => {
          const meta = RISK_BAND_META[row.risk_band]
          const reason = row.top_factors[0]?.detail
          return (
            <Link
              key={row.student_id}
              to={`/dashboard/${row.student_id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.student.full_name}</span>
                  <span className="text-xs text-muted-foreground">{row.student.roll_number}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.student.program} · Year {row.student.year}
                  {row.student.section ? ` · Section ${row.student.section}` : ''}
                </div>
                {reason && <div className="mt-1 text-xs text-muted-foreground">{reason}</div>}
              </div>
              <Badge className={meta.badgeClass}>{meta.label}</Badge>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function StatTile({
  count,
  label,
  dot,
  active,
  onClick,
}: {
  count: number
  label: string
  dot: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition-colors',
        active ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-accent',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="font-display mt-1 text-2xl font-semibold">{count}</div>
    </button>
  )
}
