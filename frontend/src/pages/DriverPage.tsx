import { useEffect, useRef, useState } from 'react'
import { CAMPUS_CENTER } from '@/components/map/campusData'
import { Button } from '@/components/ui/button'
import { MOCK_BUSES } from '@/lib/mockData'

interface Position {
  lng: number
  lat: number
  speedKmh: number
  headingDeg: number
}

function nextPosition(prev: Position): Position {
  const angle = (prev.headingDeg + (Math.random() - 0.5) * 20) % 360
  const rad = (angle * Math.PI) / 180
  const step = 0.00006
  return {
    lng: prev.lng + Math.cos(rad) * step,
    lat: prev.lat + Math.sin(rad) * step,
    speedKmh: Math.round(15 + Math.random() * 20),
    headingDeg: angle,
  }
}

export function DriverPage() {
  const [busId, setBusId] = useState(MOCK_BUSES[0].id)
  const [broadcasting, setBroadcasting] = useState(false)
  const [position, setPosition] = useState<Position>({
    lng: CAMPUS_CENTER[0],
    lat: CAMPUS_CENTER[1],
    speedKmh: 0,
    headingDeg: 90,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (broadcasting) {
      intervalRef.current = setInterval(() => {
        setPosition((prev) => nextPosition(prev))
      }, 2000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [broadcasting])

  function toggleBroadcast() {
    setBroadcasting((v) => !v)
    if (!broadcasting) {
      setPosition((prev) => ({ ...prev, speedKmh: Math.round(15 + Math.random() * 20) }))
    } else {
      setPosition((prev) => ({ ...prev, speedKmh: 0 }))
    }
  }

  const bus = MOCK_BUSES.find((b) => b.id === busId) ?? MOCK_BUSES[0]

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-semibold">Driver broadcast</h1>
      <p className="text-sm text-muted-foreground">Share this bus's live position while the route is running.</p>
      <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Demo mode: position below is simulated on this device and isn't written to bus_positions yet —
        the real driver-auth model hasn't been decided.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="bus-select" className="text-sm font-medium">
            Which bus are you driving?
          </label>
          <select
            id="bus-select"
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            disabled={broadcasting}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          >
            {MOCK_BUSES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} — {b.routeName}
              </option>
            ))}
          </select>
        </div>

        <Button size="lg" onClick={toggleBroadcast} variant={broadcasting ? 'destructive' : 'default'}>
          {broadcasting ? 'Stop broadcasting' : 'Start broadcasting'}
        </Button>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`h-2 w-2 rounded-full ${broadcasting ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
            />
            {broadcasting ? `Broadcasting ${bus.label}` : 'Not broadcasting'}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Position</dt>
            <dd className="text-right tabular-nums">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </dd>
            <dt className="text-muted-foreground">Speed</dt>
            <dd className="text-right tabular-nums">{position.speedKmh} km/h</dd>
            <dt className="text-muted-foreground">Heading</dt>
            <dd className="text-right tabular-nums">{Math.round(position.headingDeg)}°</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}
