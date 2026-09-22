import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, Clock } from 'lucide-react'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrentLecture } from '@/components/map/lectureInfo'
import { fetchScanClassroom, selfCheckIn, type ScanClassroom, type SelfCheckInResult } from '@/lib/selfCheckIn'
import { hasSupabaseConfig } from '@/lib/supabase'

// Public page — no login. A student lands here by scanning the classroom QR
// (which encodes this page's URL + ?room=<classroomId>), types their roll
// number, and the server resolves their name and records attendance with the
// database clock. Nothing about identity or time is trusted from the phone.
export function ScanPage() {
  const [params] = useSearchParams()
  const roomId = params.get('room') ?? ''

  const [classroom, setClassroom] = useState<ScanClassroom | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(true)
  const [roomError, setRoomError] = useState<string | null>(null)

  const [roll, setRoll] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SelfCheckInResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) {
      setLoadingRoom(false)
      setRoomError('This QR code is missing its classroom link. Ask your teacher for the correct code.')
      return
    }
    fetchScanClassroom(roomId)
      .then((room) => {
        if (!room) setRoomError('This classroom link is no longer valid. Ask your teacher for a fresh code.')
        else setClassroom(room)
      })
      .catch(() => setRoomError('Could not reach the check-in service. Check your connection and retry.'))
      .finally(() => setLoadingRoom(false))
  }, [roomId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roll.trim() || busy || !classroom) return
    setBusy(true)
    setSubmitError(null)
    try {
      const res = await selfCheckIn(roll, classroom.id)
      setResult(res)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Check-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const lecture = classroom ? getCurrentLecture(classroom.id, classroom.buildingName) : undefined

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-muted-foreground">
        <BrandMark className="h-5 w-5" />
        <span className="font-display text-sm font-semibold tracking-tight text-foreground">Naksha check-in</span>
      </div>

      {!hasSupabaseConfig && (
        <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          The check-in service isn't configured on this site copy — attendance can't be recorded from here.
        </p>
      )}

      {loadingRoom && <p className="text-sm text-muted-foreground">Finding your classroom…</p>}

      {!loadingRoom && roomError && (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="flex items-start gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            {roomError}
          </p>
        </div>
      )}

      {!loadingRoom && !roomError && classroom && !result && (
        <>
          <h1 className="text-xl font-semibold">
            {classroom.buildingName} — {classroom.roomNumber}
          </h1>
          {lecture && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" />
              {lecture.subject} · {lecture.timeSlot}
            </p>
          )}
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <Label htmlFor="scan-roll">Your roll number</Label>
              <Input
                id="scan-roll"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                placeholder="e.g. NKS25001"
                autoComplete="off"
                autoCapitalize="characters"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Type the roll number from your ID card — your name is looked up automatically.
              </p>
            </div>
            <Button type="submit" size="lg" disabled={!roll.trim() || busy}>
              {busy ? 'Checking in…' : 'Check me in'}
            </Button>
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </form>
        </>
      )}

      {result && classroom && (
        <div className="rounded-md border border-border bg-card p-5 text-center">
          {result.ok ? (
            <>
              <CircleCheck className="mx-auto size-10 text-emerald-500" />
              <h1 className="mt-3 text-xl font-semibold">
                {result.status === 'already_checked_in' ? 'Already checked in' : "You're checked in"}
              </h1>
              <p className="mt-1 text-sm">
                {result.full_name} <span className="text-muted-foreground">({result.roll_number})</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {classroom.buildingName} — {classroom.roomNumber} · {new Date().toLocaleTimeString()}
              </p>
              {result.status === 'already_checked_in' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Your attendance for this class is already recorded — nothing more to do.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Not you? Tap below and enter the correct roll number.
              </p>
            </>
          ) : (
            <>
              <CircleAlert className="mx-auto size-10 text-destructive" />
              <h1 className="mt-3 text-xl font-semibold">Roll number not found</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                No student matches "{roll.trim()}". Check the spelling with your teacher — new students
                must be registered before they can check in.
              </p>
            </>
          )}
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setResult(null)
              setRoll('')
            }}
          >
            Check in another student
          </Button>
        </div>
      )}
    </div>
  )
}
