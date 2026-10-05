import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkInByRollNumber, fetchClassrooms, type CheckedInStudent, type ClassroomOption } from '@/lib/checkIn'
import { buildCheckInUrl, issueCheckInCode } from '@/lib/selfCheckIn'

interface LogEntry {
  rollNumber: string
  fullName: string
  time: string
  status: 'checked_in' | 'already_checked_in'
}

const LAST_CLASSROOM_KEY = 'naksha-checkin-classroom'
const REFRESH_SECONDS = 20

function useRotatingCode(classroomId: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SECONDS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classroomId) return
    let cancelled = false
    let nextRefreshAt = 0

    const refresh = async () => {
      try {
        const code = await issueCheckInCode(classroomId)
        if (cancelled) return
        setUrl(buildCheckInUrl(classroomId, code.token))
        setError(null)
      } catch {
        if (!cancelled) {
          setUrl(null)
          setError("Couldn't create a check-in code. Make sure migration 0005 has been applied in Supabase.")
        }
      }
      nextRefreshAt = Date.now() + REFRESH_SECONDS * 1000
    }

    void refresh()
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) {
        nextRefreshAt = Date.now() + REFRESH_SECONDS * 1000
        void refresh()
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [classroomId])

  return { url, secondsLeft, error }
}

export function CheckInPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([])
  const [classroomId, setClassroomId] = useState<string>('')
  const [loadingClassrooms, setLoadingClassrooms] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  const [manualInput, setManualInput] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  const { url, secondsLeft, error: codeError } = useRotatingCode(classroomId)
  const selectedRoom = classrooms.find((c) => c.id === classroomId)

  useEffect(() => {
    fetchClassrooms()
      .then((rooms) => {
        setClassrooms(rooms)
        const saved = localStorage.getItem(LAST_CLASSROOM_KEY)
        if (saved && rooms.some((r) => r.id === saved)) setClassroomId(saved)
        else if (rooms.length > 0) setClassroomId(rooms[0].id)
      })
      .catch((e: unknown) => setLookupError(e instanceof Error ? e.message : 'Failed to load classrooms.'))
      .finally(() => setLoadingClassrooms(false))
  }, [])

  function selectClassroom(id: string) {
    setClassroomId(id)
    localStorage.setItem(LAST_CLASSROOM_KEY, id)
  }

  function logResult(student: CheckedInStudent, status: LogEntry['status']) {
    setLog((prev) => [
      { rollNumber: student.rollNumber, fullName: student.fullName, time: new Date().toLocaleTimeString(), status },
      ...prev,
    ])
  }

  async function recordManualCheckIn(roll: string) {
    if (!classroomId) return
    setBusy(true)
    try {
      const result = await checkInByRollNumber(roll, classroomId, 'manual')
      if (result.status === 'not_found') {
        setLookupError(`No student found for "${roll}".`)
        return
      }
      setLookupError(null)
      logResult(result.student, result.status)
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Check-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Class check-in</h1>
      <p className="text-sm text-muted-foreground">
        Show this code on the projector. Students scan it with their phone camera; the map and mentor
        dashboard update as they check in.
      </p>

      <div className="mt-6">
        <Label htmlFor="classroom-select">Classroom</Label>
        <select
          id="classroom-select"
          value={classroomId}
          onChange={(e) => selectClassroom(e.target.value)}
          disabled={loadingClassrooms || classrooms.length === 0}
          className="mt-1.5 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        >
          {classrooms.length === 0 && <option>No classrooms found</option>}
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.buildingName} — {c.roomNumber}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="rounded-md border border-border bg-card p-4">
          {codeError ? (
            <p className="max-w-[240px] text-sm text-destructive">{codeError}</p>
          ) : url ? (
            <>
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG value={url} size={220} />
              </div>
              <CountdownBar secondsLeft={secondsLeft} />
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setFullscreen(true)}>
                <Maximize2 className="size-4" />
                Show full screen
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Creating code…</p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium">Student without a phone?</h2>
          <form
            className="mt-1.5 flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!manualInput.trim() || busy) return
              void recordManualCheckIn(manualInput)
              setManualInput('')
            }}
          >
            <Input
              aria-label="Roll number"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Roll number"
              disabled={!classroomId}
            />
            <Button type="submit" disabled={!classroomId || busy}>Check in</Button>
          </form>
          {lookupError && <p className="mt-2 text-xs text-destructive">{lookupError}</p>}

          <h2 className="mt-6 text-sm font-medium text-muted-foreground">Checked in manually this session</h2>
          {log.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {log.map((entry, i) => (
                <li
                  key={`${entry.rollNumber}-${entry.time}-${i}`}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{entry.fullName}</span>{' '}
                    <span className="text-xs text-muted-foreground">{entry.rollNumber}</span>
                    {entry.status === 'already_checked_in' && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">already checked in</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {fullscreen && url && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-slate-900">
          <button
            type="button"
            aria-label="Exit full screen"
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="size-6" />
          </button>
          {selectedRoom && (
            <p className="font-display text-3xl font-semibold">
              {selectedRoom.buildingName} — {selectedRoom.roomNumber}
            </p>
          )}
          <QRCodeSVG value={url} size={Math.min(window.innerWidth, window.innerHeight) * 0.6} />
          <p className="text-lg text-slate-600">Scan with your phone camera to check in</p>
          <div className="w-64">
            <CountdownBar secondsLeft={secondsLeft} />
          </div>
        </div>
      )}
    </div>
  )
}

function CountdownBar({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div className="mt-3">
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${(secondsLeft / REFRESH_SECONDS) * 100}%` }}
        />
      </div>
      <p className="mt-1 text-center text-xs text-muted-foreground">New code in {secondsLeft}s</p>
    </div>
  )
}
