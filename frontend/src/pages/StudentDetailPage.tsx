import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ResetMenu, StudentAcademicsCards } from '@/components/student/StudentAcademics'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchStudentDetail, recommendedActions, RISK_BAND_META, type StudentDetail } from '@/lib/riskDashboard'
import { fetchLinkedDevice, resetStudentDevice } from '@/lib/selfCheckIn'

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a reset so every card refetches.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!studentId) return
    fetchStudentDetail(studentId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load student.'))
      .finally(() => setLoading(false))
  }, [studentId, refreshKey])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!detail) return <p className="p-6 text-sm text-muted-foreground">Student not found.</p>

  const { student, risk, checkIns, attendanceTrend, classDays, presentDays } = detail
  const meta = risk ? RISK_BAND_META[risk.risk_band] : null
  const livePct = classDays > 0 ? Math.round((100 * presentDays) / classDays) : null
  const chartData = attendanceTrend.map((d) => ({
    date: d.date.slice(5),
    present: d.status === 'no_class' ? 0.15 : d.status === 'present' ? 1 : 0.15,
    status: d.status,
  }))

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/dashboard" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ← Back to dashboard
      </Link>

      <div className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{student.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {student.roll_number} · {student.program} · Year {student.year}
            {student.section ? ` · Section ${student.section}` : ''}
          </p>
          <p className="mt-1 text-sm">
            {livePct === null ? (
              <span className="text-muted-foreground">No classes recorded in the last 14 days</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums">{livePct}%</span>{' '}
                <span className="text-muted-foreground">
                  present on {presentDays} of {classDays} class days in the last 14 days (live)
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {meta && <Badge className={meta.badgeClass}>{meta.label}</Badge>}
          <ResetMenu studentId={student.id} onDone={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <StudentAcademicsCards studentId={student.id} refreshKey={refreshKey} />

      {risk && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Why this score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {risk.top_factors.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{f.factor}</div>
                  <div className="text-xs text-muted-foreground">{f.detail}</div>
                </div>
                <span className={f.direction === 'negative' ? 'text-red-500' : 'text-emerald-600'}>
                  {f.direction === 'negative' ? '▼' : '▲'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Attendance — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis hide domain={[0, 1]} />
                <Tooltip formatter={(v) => (v ? 'Present' : 'Absent')} />
                <Bar dataKey="present" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.status === 'present' ? '#22c55e' : d.status === 'absent' ? '#ef4444' : '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {risk && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Recommended actions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">
              {recommendedActions(risk.risk_band).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <LinkedPhoneCard studentId={student.id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check-in log</CardTitle>
        </CardHeader>
        <CardContent>
          {checkIns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Date</th>
                    <th className="py-1 pr-4 font-medium">Room</th>
                    <th className="py-1 pr-4 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {checkIns.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-1.5 pr-4">{c.session_date}</td>
                      <td className="py-1.5 pr-4">{c.building_name} — {c.room_number}</td>
                      <td className="py-1.5 pr-4 capitalize">{c.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LinkedPhoneCard({ studentId }: { studentId: string }) {
  const [linked, setLinked] = useState<{ boundAt: string } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLinkedDevice(studentId)
      .then(setLinked)
      .catch(() => setLinked(null))
  }, [studentId])

  async function handleReset() {
    setBusy(true)
    setError(null)
    try {
      await resetStudentDevice(studentId)
      setLinked(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the linked phone.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Check-in phone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {linked === undefined ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : linked ? (
          <>
            <span>
              Linked since {new Date(linked.boundAt).toLocaleDateString()}
              <span className="block text-xs text-muted-foreground">
                Reset if the student changed phones or someone else linked this roll number.
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset linked phone'}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">
            No phone linked yet. The student's first QR scan will link one.
          </span>
        )}
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
