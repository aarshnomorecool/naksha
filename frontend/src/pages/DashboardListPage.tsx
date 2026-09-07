import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { fetchRiskList, RISK_BAND_META, type RiskListRow } from '@/lib/riskDashboard'

export function DashboardListPage() {
  const { signOut } = useAuth()
  const [rows, setRows] = useState<RiskListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRiskList()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load risk scores.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Mentor dashboard</h1>
          <p className="text-sm text-muted-foreground">Students sorted by priority — highest first.</p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
      </div>

      <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Placeholder scores: heuristically derived from seeded attendance history, not a trained model yet
        (XGBoost + SHAP is build-order step 4 in the project spec).
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No risk scores yet — run supabase/seed_risk.sql in the Supabase SQL editor.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
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
