import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MOCK_STUDENTS, type ConsentRecord } from '@/lib/mockData'

const PURPOSES = [
  {
    id: 'attendance',
    label: 'Attendance tracking',
    detail: 'Recording when your ward checks in to class, by QR badge scan or manual entry.',
  },
  {
    id: 'risk_flagging',
    label: 'Early-support flagging',
    detail: "Using attendance patterns to flag if your ward might benefit from a mentor's attention.",
  },
  {
    id: 'mentor_sharing',
    label: 'Sharing with assigned mentor',
    detail: "Letting your ward's assigned mentor see the flag above and the reasons behind it.",
  },
]

export function ConsentPage() {
  const [guardianName, setGuardianName] = useState('')
  const [relationship, setRelationship] = useState('Parent')
  const [rollNumber, setRollNumber] = useState(MOCK_STUDENTS[0].rollNumber)
  const [purposes, setPurposes] = useState<string[]>([])
  const [records, setRecords] = useState<ConsentRecord[]>([])
  const [submitted, setSubmitted] = useState(false)

  function togglePurpose(id: string) {
    setPurposes((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!guardianName.trim() || purposes.length === 0) return
    const record: ConsentRecord = {
      id: crypto.randomUUID(),
      guardianName: guardianName.trim(),
      relationship,
      studentRollNumber: rollNumber,
      purposes,
      submittedAt: new Date().toLocaleString(),
    }
    setRecords((prev) => [record, ...prev])
    setGuardianName('')
    setPurposes([])
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold">Guardian consent</h1>
      <p className="text-sm text-muted-foreground">
        Record what a parent or guardian has agreed to share, and why.
      </p>
      <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Demo mode: submissions below are kept in this browser tab only — there's no consent table in
        the database yet. Consent can be withdrawn at any time by contacting the institution.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <div>
          <Label htmlFor="guardian-name">Your name</Label>
          <Input
            id="guardian-name"
            className="mt-1.5"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="relationship">Relationship to student</Label>
          <select
            id="relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option>Parent</option>
            <option>Legal guardian</option>
            <option>Other</option>
          </select>
        </div>

        <div>
          <Label htmlFor="student">Student</Label>
          <select
            id="student"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {MOCK_STUDENTS.map((s) => (
              <option key={s.rollNumber} value={s.rollNumber}>
                {s.fullName} — {s.rollNumber}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">What you're agreeing to</legend>
          <div className="mt-2 flex flex-col gap-3">
            {PURPOSES.map((p) => (
              <label key={p.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={purposes.includes(p.id)}
                  onChange={() => togglePurpose(p.id)}
                />
                <span>
                  <span className="block font-medium">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{p.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" disabled={!guardianName.trim() || purposes.length === 0}>
          Record consent
        </Button>
        {submitted && <p className="text-sm text-emerald-600 dark:text-emerald-400">Consent recorded.</p>}
      </form>

      {records.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium text-muted-foreground">Recorded this session</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {records.map((r) => {
              const student = MOCK_STUDENTS.find((s) => s.rollNumber === r.studentRollNumber)
              return (
                <li key={r.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.guardianName} <span className="font-normal text-muted-foreground">({r.relationship})</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{r.submittedAt}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    For {student?.fullName ?? r.studentRollNumber} · {r.purposes.length} purpose
                    {r.purposes.length === 1 ? '' : 's'} agreed
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
