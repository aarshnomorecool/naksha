import { fetchAllRows } from '@/lib/fetchAllRows'
import { supabase } from '@/lib/supabase'

// CSV roster import. Designed around a Google Form export: free-form column
// headers are auto-matched to our fields, and a consent column (if present)
// gates each row. Writes go to `students` via upsert on roll_number, which
// needs the update policy from supabase/migrations/0006_roster_import.sql.

export type RosterField = 'roll_number' | 'full_name' | 'program' | 'year' | 'section' | 'email' | 'consent'

export const FIELD_LABELS: Record<RosterField, string> = {
  roll_number: 'Roll number',
  full_name: 'Full name',
  program: 'Program / branch',
  year: 'Year',
  section: 'Section',
  email: 'Email',
  consent: 'Consent',
}

export const REQUIRED_FIELDS: RosterField[] = ['roll_number', 'full_name', 'program', 'year']

const SYNONYMS: Record<RosterField, string[]> = {
  roll_number: ['rollnumber', 'rollno', 'roll', 'enrollmentnumber', 'enrolmentnumber', 'enrollmentno', 'prn', 'registrationnumber', 'regno', 'usn'],
  full_name: ['fullname', 'name', 'studentname', 'nameofstudent'],
  program: ['program', 'programme', 'branch', 'course', 'department', 'dept', 'degree', 'stream'],
  year: ['year', 'yearofstudy', 'currentyear', 'studyyear'],
  section: ['section', 'division', 'div', 'batch'],
  email: ['email', 'emailaddress', 'emailid', 'collegeemail', 'gmail', 'mail'],
  consent: ['consent'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// RFC 4180-ish: quoted fields, escaped quotes, commas/newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export type ColumnMapping = Partial<Record<RosterField, number>>

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const taken = new Set<number>()
  const normalized = headers.map(normalizeHeader)

  for (const field of Object.keys(SYNONYMS) as RosterField[]) {
    // Exact synonym match first, then "header contains synonym" (Google Form
    // questions are often long, e.g. "Your roll number (as on ID card)").
    let idx = normalized.findIndex((h, i) => !taken.has(i) && SYNONYMS[field].includes(h))
    if (idx === -1) {
      idx = normalized.findIndex((h, i) => !taken.has(i) && SYNONYMS[field].some((s) => s.length > 3 && h.includes(s)))
    }
    if (field === 'consent' && idx === -1) {
      idx = normalized.findIndex((h, i) => !taken.has(i) && (h.includes('consent') || h.includes('agree')))
    }
    if (idx !== -1) {
      mapping[field] = idx
      taken.add(idx)
    }
  }
  return mapping
}

const YEAR_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, final: 4,
  i: 1, ii: 2, iii: 3, iv: 4,
  fe: 1, fy: 1, se: 2, sy: 2, te: 3, ty: 3, be: 4, ly: 4,
}

export function parseYear(raw: string): number | null {
  const v = raw.trim().toLowerCase()
  // A batch/graduation year ("2025") is not a year of study.
  if (!v || /\d{3,}/.test(v)) return null
  const digit = v.match(/[1-4]/)
  if (digit) return Number(digit[0])
  const word = v.split(/[^a-z]+/).find((w) => w in YEAR_WORDS)
  return word ? YEAR_WORDS[word] : null
}

// Refusals are checked first: "Disagree" and "No, I do not consent" both
// contain a consent word, and importing a refusal as consent is the worst
// possible failure here.
export function isConsentGiven(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return false
  if (/\b(no|not|don'?t|disagree|decline|declined|refuse|refused|reject|rejected|false|n)\b/.test(v) || v.includes('disagree')) {
    return false
  }
  return /(yes|agree|accept|consent|true|^y$|checked)/.test(v)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface StudentDraft {
  roll_number: string
  full_name: string
  program: string
  year: number
  section: string | null
  email: string | null
}

export type RowOutcome =
  | { kind: 'ok'; student: StudentDraft; isUpdate: boolean }
  | { kind: 'error'; reason: string }
  | { kind: 'skipped'; reason: string }

export interface PreviewRow {
  line: number
  raw: string[]
  outcome: RowOutcome
}

// existingRolls: UPPERCASED roll number -> roll number exactly as stored.
export function buildPreview(
  dataRows: string[][],
  mapping: ColumnMapping,
  existingRolls: Map<string, string>,
): PreviewRow[] {
  const cell = (r: string[], f: RosterField) => (mapping[f] === undefined ? '' : (r[mapping[f]!] ?? '').trim())
  const seenRolls = new Set<string>()
  const seenEmails = new Set<string>()

  return dataRows.map((raw, i) => {
    const line = i + 2
    if (mapping.consent !== undefined && !isConsentGiven(cell(raw, 'consent'))) {
      return { line, raw, outcome: { kind: 'skipped', reason: 'No consent given' } }
    }

    const roll = cell(raw, 'roll_number').toUpperCase().replace(/\s+/g, '')
    const name = cell(raw, 'full_name').replace(/\s+/g, ' ')
    const program = cell(raw, 'program')
    const yearRaw = cell(raw, 'year')
    const year = parseYear(yearRaw)
    const section = cell(raw, 'section') || null
    const emailRaw = cell(raw, 'email').toLowerCase()

    const missing = REQUIRED_FIELDS.filter((f) => !cell(raw, f))
    if (missing.length > 0) {
      return { line, raw, outcome: { kind: 'error', reason: `Missing ${missing.map((f) => FIELD_LABELS[f].toLowerCase()).join(', ')}` } }
    }
    if (year === null) {
      return { line, raw, outcome: { kind: 'error', reason: `Can't read year "${yearRaw}" (use 1–4)` } }
    }
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      return { line, raw, outcome: { kind: 'error', reason: `Invalid email "${emailRaw}"` } }
    }
    if (seenRolls.has(roll)) {
      return { line, raw, outcome: { kind: 'error', reason: `Roll number ${roll} appears twice in this file` } }
    }
    if (emailRaw && seenEmails.has(emailRaw)) {
      return { line, raw, outcome: { kind: 'error', reason: `Email ${emailRaw} appears twice in this file` } }
    }
    seenRolls.add(roll)
    if (emailRaw) seenEmails.add(emailRaw)

    return {
      line,
      raw,
      outcome: {
        kind: 'ok',
        isUpdate: existingRolls.has(roll),
        student: { roll_number: roll, full_name: name, program, year, section, email: emailRaw || null },
      },
    }
  })
}

export async function fetchExistingRollNumbers(): Promise<Map<string, string>> {
  if (!supabase) return new Map()
  const client = supabase
  const rows = await fetchAllRows<{ roll_number: string }>((from, to) =>
    client.from('students').select('roll_number').order('roll_number').range(from, to),
  )
  return new Map(rows.map((r) => [r.roll_number.toUpperCase(), r.roll_number]))
}

const IMPORT_BATCH = 20

export async function importStudents(
  students: StudentDraft[],
  consentSource: string,
  existingRolls: Map<string, string>,
): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const consentAt = new Date().toISOString()

  // Blank email/section are left out rather than sent as null, so re-importing
  // a sheet without those columns doesn't wipe what's already stored. Rows are
  // grouped by which columns they carry because a bulk upsert takes its column
  // list from the batch as a whole. roll_number is sent exactly as stored, so
  // a case difference updates the student instead of inserting a duplicate.
  const payloads = students.map((s) => {
    const row: Record<string, unknown> = {
      roll_number: existingRolls.get(s.roll_number) ?? s.roll_number,
      full_name: s.full_name,
      program: s.program,
      year: s.year,
      is_demo: false,
      consent_at: consentAt,
      consent_source: consentSource,
    }
    if (s.section) row.section = s.section
    if (s.email) row.email = s.email
    return row
  })
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const p of payloads) {
    const key = Object.keys(p).sort().join(',')
    groups.set(key, [...(groups.get(key) ?? []), p])
  }

  let written = 0
  // Small batches: each new student also generates ~100 baseline rows inside
  // the same request (0008's insert trigger), and Supabase cancels requests
  // from signed-in users after about 8 seconds.
  for (const group of groups.values()) for (let i = 0; i < group.length; i += IMPORT_BATCH) {
    const batch = group.slice(i, i + IMPORT_BATCH)
    const { error } = await supabase.from('students').upsert(batch, { onConflict: 'roll_number' })
    if (error) {
      if (error.code === '23505' && error.message.includes('email')) {
        throw new Error(
          `Stopped after ${written} students: one of ${batch.map((b) => b.roll_number).join(', ')} has an email that already belongs to a different roll number in the database.`,
        )
      }
      throw new Error(`Stopped after ${written} students: ${error.message}`)
    }
    written += batch.length
  }
  return written
}

export function templateCsv(): string {
  return [
    'Roll number,Full name,Program,Year,Section,Email,Consent',
    'NKS25101,Example Student,B.Tech CSE,2,A,example.student@gmail.com,I agree',
  ].join('\n')
}
