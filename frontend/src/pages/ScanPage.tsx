import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, Clock, Smartphone } from 'lucide-react'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrentLecture } from '@/components/map/lectureInfo'
import {
  fetchScanClassroom,
  getLinkedRoll,
  selfCheckIn,
  setLinkedRoll,
  type ScanClassroom,
  type SelfCheckInResult,
} from '@/lib/selfCheckIn'
import { hasSupabaseConfig } from '@/lib/supabase'

type View =
  | { kind: 'loading' }
  | { kind: 'link' }
  | { kind: 'done'; result: SelfCheckInResult }
  | { kind: 'blocked'; title: string; message: string }

// Public page, no login. Students land here from the rotating QR on the
// teacher's screen (?room=<id>&t=<token>). First visit links this phone to a
// roll number; every later scan checks the linked student in automatically.
export function ScanPage() {
  const [params] = useSearchParams()
  const roomId = params.get('room') ?? ''
  const token = params.get('t') ?? ''

  const [classroom, setClassroom] = useState<ScanClassroom | null>(null)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [roll, setRoll] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const autoTried = useRef(false)

  const handleResult = useCallback((res: SelfCheckInResult) => {
    switch (res.status) {
      case 'checked_in':
      case 'already_checked_in':
        setLinkedRoll(res.roll_number ?? null)
        setView({ kind: 'done', result: res })
        return
      case 'needs_roll_number':
        setLinkedRoll(null)
        setView({ kind: 'link' })
        return
      case 'not_found':
        setFormError('No student has that roll number. Check it against your ID card.')
        setView({ kind: 'link' })
        return
      case 'roll_linked_elsewhere':
        setView({
          kind: 'blocked',
          title: 'Roll number linked to another phone',
          message:
            "That roll number is already linked to a different phone. If that isn't you, ask your mentor to reset it, then scan again.",
        })
        return
      case 'expired_code':
        setView({
          kind: 'blocked',
          title: 'This code has expired',
          message: 'Codes refresh every few seconds. Scan the code on the screen again.',
        })
        return
      default:
        setView({ kind: 'blocked', title: 'Check-in failed', message: 'Scan the code on the screen again.' })
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setView({
        kind: 'blocked',
        title: 'Scan the code on the screen',
        message: "This link doesn't include a check-in code. Scan the QR shown on your teacher's screen.",
      })
      return
    }
    if (roomId) {
      fetchScanClassroom(roomId).then(setClassroom).catch(() => {})
    }
    if (autoTried.current) return
    autoTried.current = true

    // Phone already linked: check in straight away, no typing.
    if (getLinkedRoll()) {
      selfCheckIn(token)
        .then(handleResult)
        .catch(() =>
          setView({ kind: 'blocked', title: 'Could not reach check-in', message: 'Check your connection and scan again.' }),
        )
    } else {
      setView({ kind: 'link' })
    }
  }, [token, roomId, handleResult])

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    if (!roll.trim() || busy) return
    setBusy(true)
    setFormError(null)
    try {
      handleResult(await selfCheckIn(token, roll))
    } catch {
      setFormError('Could not reach check-in. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const roomLabel = classroom ? `${classroom.buildingName} — ${classroom.roomNumber}` : null

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-muted-foreground">
        <BrandMark className="h-5 w-5" />
        <span className="font-display text-sm font-semibold tracking-tight text-foreground">Naksha check-in</span>
      </div>

      {!hasSupabaseConfig && (
        <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          The check-in service isn't configured on this site copy, so attendance can't be recorded from here.
        </p>
      )}

      {view.kind === 'loading' && <p className="text-sm text-muted-foreground">Checking you in…</p>}

      {view.kind === 'link' && (
        <>
          {roomLabel && <h1 className="text-xl font-semibold">{roomLabel}</h1>}
          <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              First time on this phone. Enter your roll number once and this phone will be linked to you —
              after that, scanning checks you in automatically.
            </p>
          </div>
          <form onSubmit={handleLink} className="mt-6 flex flex-col gap-4">
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
                Only enter your own. A roll number can be linked to one phone only.
              </p>
            </div>
            <Button type="submit" size="lg" disabled={!roll.trim() || busy}>
              {busy ? 'Linking…' : 'Link this phone and check in'}
            </Button>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </form>
        </>
      )}

      {view.kind === 'done' && <DoneCard result={view.result} />}

      {view.kind === 'blocked' && (
        <div className="rounded-md border border-border bg-card p-5 text-center">
          <CircleAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">{view.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{view.message}</p>
        </div>
      )}
    </div>
  )
}

function DoneCard({ result }: { result: SelfCheckInResult }) {
  // The server stamps the period it recorded; fall back to the local
  // timetable only if it couldn't (older migration, no period running).
  const lecture =
    result.subject
      ? { subject: result.subject, timeSlot: '', status: 'live' as const }
      : result.classroom_id && result.building_name
        ? getCurrentLecture(result.classroom_id, result.building_name)
        : undefined
  return (
    <div className="rounded-md border border-border bg-card p-5 text-center">
      <CircleCheck className="mx-auto size-12 text-emerald-500" />
      <h1 className="mt-3 text-xl font-semibold">
        {result.status === 'already_checked_in' ? 'Already checked in' : "You're checked in"}
      </h1>
      <p className="mt-1 text-sm">
        {result.full_name} <span className="text-muted-foreground">({result.roll_number})</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {result.building_name} — {result.room_number}
      </p>
      {lecture && lecture.status === 'live' && (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-3.5" />
          {lecture.timeSlot ? `${lecture.subject}, ${lecture.timeSlot}` : lecture.subject}
        </p>
      )}
      <Button asChild size="lg" className="mt-5 w-full">
        <Link to="/me">View my attendance</Link>
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">
        This phone is linked to {result.roll_number}. If that's wrong, ask your mentor to reset it.
      </p>
    </div>
  )
}
