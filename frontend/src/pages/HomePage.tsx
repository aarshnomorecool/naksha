import { ScanLine, SquareUser, Waypoints } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { CampusSketch } from '@/components/CampusSketch'
import { Button } from '@/components/ui/button'

const surfaces = [
  {
    to: '/map',
    icon: Waypoints,
    title: 'Live campus map',
    description: 'Select a building to view its floors, classrooms, and students present.',
  },
  {
    to: '/dashboard',
    icon: SquareUser,
    title: 'Mentor dashboard',
    description: 'Sorted by who needs attention first, with plain-language reasons for each score.',
  },
  {
    to: '/checkin',
    icon: ScanLine,
    title: 'Check-in kiosk',
    description: "Scan a student's badge at the classroom door to record attendance.",
  },
]

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-14">
        <div>
          <div className="mb-5 flex items-center gap-2 text-muted-foreground">
            <BrandMark className="h-5 w-5" />
            <span className="text-sm">Nakshā — मानचित्र, "the map"</span>
          </div>
          <h1 className="font-display max-w-[16ch] text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            A live map of campus, and an early warning system for students who need support.
          </h1>
          <p className="mt-5 max-w-[46ch] text-muted-foreground">
            Naksha tracks where campus resources are and flags which students could use a
            mentor's attention, with the reasoning shown plainly rather than a bare score.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/map">Open the map</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Mentor sign in</Link>
            </Button>
          </div>
        </div>
        <div className="aspect-[16/11] overflow-hidden rounded-md border border-border bg-card">
          <CampusSketch />
        </div>
      </div>

      <div className="mx-auto mt-20 max-w-xl">
        <p className="mb-3 text-center text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">Choose a workspace</p>
        <div className="flex flex-col gap-3">
          <WorkspaceTab to="/checkin" label="Student" />
          <WorkspaceTab to="/dashboard" label="Mentor" />
          <WorkspaceTab to="/map" label="College Live Map" />
        </div>
      </div>

      <div className="mt-20">
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Everything below reads from the same student and campus records — there's no
          separate system to keep in sync.
        </p>
        <div className="mt-6">
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
                <span className="font-display block font-medium underline-offset-4 group-hover:underline">
                  {title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function WorkspaceTab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-md border-2 border-foreground bg-card px-5 py-3 text-center font-display text-lg font-semibold tracking-wide uppercase transition-colors hover:bg-accent"
    >
      {label}
    </Link>
  )
}
