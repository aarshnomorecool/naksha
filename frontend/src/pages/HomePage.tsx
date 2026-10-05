import { QRCodeSVG } from 'qrcode.react'
import { ScanLine, SquareUser, Waypoints } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { BrandMark } from '@/components/BrandMark'
import { CampusSketch } from '@/components/CampusSketch'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { setDeviceKind, useDeviceKind } from '@/lib/device'

const surfaces = [
  {
    to: '/checkin',
    icon: ScanLine,
    title: 'Class QR',
    description: 'Show a code on the projector that refreshes every 20 seconds; students scan it to check in.',
  },
  {
    to: '/dashboard',
    icon: SquareUser,
    title: 'Mentor dashboard',
    description: 'Every student’s attendance, marks and messages, sorted by who needs attention first.',
  },
  {
    to: '/map',
    icon: Waypoints,
    title: 'Live campus map',
    description: 'Open any building to see its floors, classrooms, the class running now and who is present.',
  },
]

// Phones go straight to the student panel and signed-in staff to their
// dashboard; this landing page is for computers (staff, projectors).
export function HomePage() {
  const { session, isStaff, loading } = useAuth()
  const device = useDeviceKind()
  const navigate = useNavigate()

  if (loading) return null
  if (session && isStaff) return <Navigate to="/dashboard" replace />
  if (device === 'phone') return <Navigate to="/me" replace />

  const studentUrl = `${window.location.origin}/me`

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-14">
        <div>
          <div className="mb-5 flex items-center gap-2 text-muted-foreground">
            <BrandMark className="h-5 w-5" />
            <span className="text-sm">Nakshā — मानचित्र, "the map"</span>
          </div>
          <h1 className="font-display max-w-[16ch] text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Attendance, marks and a live map of campus, in one place.
          </h1>
          <p className="mt-5 max-w-[46ch] text-muted-foreground">
            Staff sign in here to show the class QR and follow their students. Students use their phones.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/login">Staff sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/map">Open the live map</Link>
            </Button>
          </div>
        </div>
        <div className="aspect-[16/11] overflow-hidden rounded-md border border-border bg-card">
          <CampusSketch />
        </div>
      </div>

      <section className="mt-16 flex flex-col items-start gap-5 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-md bg-white p-2">
          <QRCodeSVG value={studentUrl} size={112} />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Students: open Naksha on your phone</h2>
          <p className="mt-1 max-w-[56ch] text-sm text-muted-foreground">
            Scan this code, or go to <span className="font-medium text-foreground">{window.location.host}</span> on your phone, then
            tap <span className="font-medium text-foreground">Scan class QR</span> in class. Your attendance and marks live there.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeviceKind('phone')
              navigate('/me')
            }}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            I'm a student using this device
          </button>
        </div>
      </section>

      <div className="mt-14">
        <h2 className="text-sm font-semibold">For staff</h2>
        <div className="mt-3">
          {surfaces.map(({ to, icon: Icon, title, description }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-start gap-4 border-t border-border py-5 first:border-t-0 last:border-b"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-accent text-accent-foreground">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="font-display block font-medium underline-offset-4 group-hover:underline">{title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
