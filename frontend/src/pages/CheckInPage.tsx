import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkInByRollNumber, fetchClassrooms, type CheckedInStudent, type ClassroomOption } from '@/lib/checkIn'
import { buildCheckInUrl } from '@/lib/selfCheckIn'

interface LogEntry {
  rollNumber: string
  fullName: string
  time: string
  status: 'checked_in' | 'already_checked_in'
}

const READER_ID = 'checkin-reader'
const LAST_CLASSROOM_KEY = 'naksha-checkin-classroom'

export function CheckInPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([])
  const [classroomId, setClassroomId] = useState<string>('')
  const [loadingClassrooms, setLoadingClassrooms] = useState(true)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const classroomIdRef = useRef(classroomId)
  classroomIdRef.current = classroomId

  useEffect(() => {
    fetchClassrooms()
      .then((rooms) => {
        setClassrooms(rooms)
        const saved = localStorage.getItem(LAST_CLASSROOM_KEY)
        if (saved && rooms.some((r) => r.id === saved)) {
          setClassroomId(saved)
        } else if (rooms.length > 0) {
          setClassroomId(rooms[0].id)
        }
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

  async function recordCheckIn(rawCode: string, method: 'qr' | 'manual') {
    const room = classroomIdRef.current
    if (!room) {
      setLookupError('Select a classroom first.')
      return
    }
    setBusy(true)
    try {
      const result = await checkInByRollNumber(rawCode, room, method)
      if (result.status === 'not_found') {
        setLookupError(`No student found for "${rawCode}".`)
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

  function handleScan(decodedText: string) {
    void recordCheckIn(decodedText, 'qr')
    scannerRef.current?.pause(true)
    pauseTimeoutRef.current = setTimeout(() => {
      try {
        scannerRef.current?.resume()
      } catch {
        // scanner may already be stopped (page navigated away) — ignore
      }
    }, 1500)
  }

  async function startCamera() {
    setCameraError(null)
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, handleScan, undefined)
      setCameraOn(true)
    } catch {
      setCameraError('Could not access a camera. Use the roll number field below instead.')
    }
  }

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
      const scanner = scannerRef.current
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {})
      }
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Check-in kiosk</h1>
      <p className="text-sm text-muted-foreground">
        Scan a student's badge as they enter the classroom. Writes a real attendance record — the map's
        occupancy layer updates from this automatically.
      </p>

      <div className="mt-6">
        <Label htmlFor="classroom-select">This kiosk is stationed at</Label>
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

      {classroomId && (
        <div className="mt-6 flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-md border border-border bg-white p-2">
            <QRCodeSVG value={buildCheckInUrl(classroomId)} size={140} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Classroom QR code</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Display this on the projector or print it for the door. Students scan it with their
              phone camera — it opens a check-in form for this classroom, and their attendance
              appears on the map and mentor dashboard automatically.
            </p>
            <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
              {buildCheckInUrl(classroomId)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void navigator.clipboard.writeText(buildCheckInUrl(classroomId))}
            >
              Copy check-in link
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div id={READER_ID} className={cameraOn ? 'aspect-square w-full' : 'hidden'} />
            {!cameraOn && (
              <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">Camera is off.</p>
                <Button onClick={startCamera} disabled={!classroomId}>Start camera</Button>
              </div>
            )}
          </div>
          {cameraError && <p className="mt-2 text-xs text-destructive">{cameraError}</p>}

          <div className="mt-4">
            <Label htmlFor="manual-roll">Or enter a roll number</Label>
            <form
              className="mt-1.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!manualInput.trim() || busy) return
                void recordCheckIn(manualInput, 'manual')
                setManualInput('')
              }}
            >
              <Input
                id="manual-roll"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="e.g. NKS24CS041"
                disabled={!classroomId}
              />
              <Button type="submit" disabled={!classroomId || busy}>Check in</Button>
            </form>
            {lookupError && <p className="mt-2 text-xs text-destructive">{lookupError}</p>}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Checked in this session</h2>
          {log.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No check-ins yet.</p>
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
    </div>
  )
}
