import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Download, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import {
  buildPreview,
  fetchExistingRollNumbers,
  FIELD_LABELS,
  guessMapping,
  importStudents,
  parseCsv,
  REQUIRED_FIELDS,
  templateCsv,
  type ColumnMapping,
  type PreviewRow,
  type RosterField,
} from '@/lib/rosterImport'
import { cn } from '@/lib/utils'

const FIELDS: RosterField[] = ['roll_number', 'full_name', 'program', 'year', 'section', 'email', 'consent']

interface LoadedFile {
  name: string
  headers: string[]
  rows: string[][]
}

export function RosterImportPage() {
  const { session } = useAuth()
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [existingRolls, setExistingRolls] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showProblemsOnly, setShowProblemsOnly] = useState(false)
  const [bulkConsent, setBulkConsent] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [imported, setImported] = useState<number | null>(null)

  async function loadFile(f: File) {
    setLoadError(null)
    setImported(null)
    setImportError(null)
    // A confirmation given for one file must never carry over to the next.
    setBulkConsent(false)
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setLoadError('Upload a .csv file. In Google Sheets: File → Download → Comma-separated values.')
      return
    }
    const parsed = parseCsv(await f.text())
    if (parsed.length < 2) {
      setLoadError('That file has no student rows below the header row.')
      return
    }
    const [headers, ...rows] = parsed
    setFile({ name: f.name, headers, rows })
    setMapping(guessMapping(headers))
    try {
      setExistingRolls(await fetchExistingRollNumbers())
    } catch {
      setExistingRolls(new Map())
    }
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => mapping[f] === undefined)
  const preview = useMemo<PreviewRow[]>(
    () => (file && missingRequired.length === 0 ? buildPreview(file.rows, mapping, existingRolls) : []),
    [file, mapping, existingRolls, missingRequired.length],
  )

  const counts = useMemo(() => {
    const c = { newRows: 0, updates: 0, errors: 0, skipped: 0 }
    for (const r of preview) {
      if (r.outcome.kind === 'ok') {
        if (r.outcome.isUpdate) c.updates++
        else c.newRows++
      } else if (r.outcome.kind === 'error') c.errors++
      else c.skipped++
    }
    return c
  }, [preview])

  const okStudents = preview.flatMap((r) => (r.outcome.kind === 'ok' ? [r.outcome.student] : []))
  const hasConsentColumn = mapping.consent !== undefined
  const consentSatisfied = hasConsentColumn || bulkConsent
  const visibleRows = (showProblemsOnly ? preview.filter((r) => r.outcome.kind !== 'ok') : preview).slice(0, 200)

  async function handleImport() {
    if (!file || okStudents.length === 0 || !consentSatisfied) return
    setImporting(true)
    setImportError(null)
    const source = hasConsentColumn
      ? `Form consent column "${file.headers[mapping.consent!]}" (${file.name})`
      : `Confirmed by ${session?.user.email ?? 'mentor'} at import (${file.name})`
    try {
      setImported(await importStudents(okStudents, source, existingRolls))
      setExistingRolls(await fetchExistingRollNumbers())
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'naksha-roster-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/dashboard" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 font-display text-xl font-semibold">Import students</h1>
      <p className="max-w-[65ch] text-sm text-muted-foreground">
        Upload the CSV from your Google Form or spreadsheet. Columns are matched automatically; check them
        below before importing. Re-importing a corrected file updates students by roll number.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) void loadFile(f)
        }}
        className={cn(
          'mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-accent/50',
        )}
      >
        <FileUp className="size-6 text-primary" />
        <span className="text-sm font-medium">{file ? `${file.name}, ${file.rows.length} rows` : 'Drop a CSV here or click to choose'}</span>
        <span className="text-xs text-muted-foreground">Google Sheets: File → Download → Comma-separated values (.csv)</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void loadFile(f)
            e.target.value = ''
          }}
        />
      </label>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>
          <Download className="size-4" />
          Download template
        </Button>
      </div>
      {loadError && <p className="mt-2 text-sm text-destructive">{loadError}</p>}

      {file && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Match columns</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((field) => (
              <label key={field} className="text-sm">
                <span className="font-medium">
                  {FIELD_LABELS[field]}
                  {REQUIRED_FIELDS.includes(field) && <span className="text-destructive"> *</span>}
                </span>
                <select
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Not in this file</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-3 text-sm text-destructive">
              Choose a column for {missingRequired.map((f) => FIELD_LABELS[f].toLowerCase()).join(', ')} to continue.
            </p>
          )}
        </section>
      )}

      {preview.length > 0 && (
        <section className="mt-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New students" value={counts.newRows} />
            <Stat label="Updates existing" value={counts.updates} />
            <Stat label="Need fixing" value={counts.errors} tone={counts.errors ? 'bad' : undefined} />
            <Stat label="Skipped, no consent" value={counts.skipped} tone={counts.skipped ? 'warn' : undefined} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Preview</h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showProblemsOnly} onChange={(e) => setShowProblemsOnly(e.target.checked)} />
              Only rows that won't import
            </label>
          </div>
          <div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Roll number</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Program</th>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const o = r.outcome
                  const s = o.kind === 'ok' ? o.student : null
                  const raw = (f: RosterField) => (mapping[f] === undefined ? '' : r.raw[mapping[f]!] ?? '')
                  return (
                    <tr key={r.line} className="border-t border-border bg-card">
                      <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{r.line}</td>
                      <td className="px-3 py-1.5">{s?.roll_number ?? raw('roll_number')}</td>
                      <td className="px-3 py-1.5">{s?.full_name ?? raw('full_name')}</td>
                      <td className="px-3 py-1.5">{s?.program ?? raw('program')}</td>
                      <td className="px-3 py-1.5">{s?.year ?? raw('year')}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {o.kind === 'ok' ? (
                          <span className="text-emerald-700 dark:text-emerald-400">{o.isUpdate ? 'Update' : 'New'}</span>
                        ) : o.kind === 'error' ? (
                          <span className="text-destructive">{o.reason}</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">{o.reason}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {preview.length > 200 && <p className="mt-1 text-xs text-muted-foreground">Showing the first 200 rows.</p>}

          <div className="mt-6 rounded-md border border-border bg-card p-4">
            {hasConsentColumn ? (
              <p className="text-sm">
                Consent is read from the <span className="font-medium">"{file!.headers[mapping.consent!]}"</span>{' '}
                column. Students who didn't agree are skipped.
              </p>
            ) : (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5" checked={bulkConsent} onChange={(e) => setBulkConsent(e.target.checked)} />
                <span>
                  Every student in this file agreed to have their roll number, name, class details and attendance
                  used by Naksha for early-support purposes, and knows they can withdraw.
                </span>
              </label>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleImport} disabled={importing || okStudents.length === 0 || !consentSatisfied}>
                {importing ? 'Importing…' : `Import ${okStudents.length} student${okStudents.length === 1 ? '' : 's'}`}
              </Button>
              {counts.errors > 0 && (
                <span className="text-xs text-muted-foreground">
                  Rows that need fixing are left out. Fix them in the sheet and re-import; existing students just update.
                </span>
              )}
            </div>
            {importError && <p className="mt-3 text-sm text-destructive">{importError}</p>}
            {imported !== null && (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CircleCheck className="size-4" />
                Imported {imported} student{imported === 1 ? '' : 's'}. They can now check in with their roll number.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 font-display text-2xl font-semibold tabular-nums',
          tone === 'bad' && 'text-destructive',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </div>
    </div>
  )
}
