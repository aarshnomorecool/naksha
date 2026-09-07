import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchStudentDetail, recommendedActions, RISK_BAND_META, type StudentDetail } from '@/lib/riskDashboard'

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    fetchStudentDetail(studentId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load student.'))
      .finally(() => setLoading(false))
  }, [studentId])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!detail) return <p className="p-6 text-sm text-muted-foreground">Student not found.</p>

  const { student, risk, checkIns, attendanceTrend } = detail
  const meta = risk ? RISK_BAND_META[risk.risk_band] : null
  const chartData = attendanceTrend.map((d) => ({
    date: d.date.slice(5),
    present: d.present ? 1 : 0,
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
        </div>
        {meta && <Badge className={meta.badgeClass}>{meta.label}</Badge>}
      </div>

      {!risk && (
        <p className="mb-4 text-sm text-muted-foreground">No risk score on file for this student yet.</p>
      )}

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
                    <Cell key={i} fill={d.present ? '#22c55e' : '#ef4444'} />
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
