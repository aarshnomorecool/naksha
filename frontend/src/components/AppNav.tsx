import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useDeviceKind } from '@/lib/device'
import { cn } from '@/lib/utils'

// Each audience sees only its own links: signed-in staff get the mentor
// tools (never the student page); students on a phone get their attendance;
// visitors on a computer get the map and staff sign-in.
const STAFF_LINKS = [
  { to: '/dashboard', label: 'Dashboard', match: (p: string) => p === '/dashboard' || /^\/dashboard\/(?!timetable|marks|import)/.test(p) },
  { to: '/checkin', label: 'Class QR', match: (p: string) => p.startsWith('/checkin') },
  { to: '/dashboard/timetable', label: 'Timetable', match: (p: string) => p.startsWith('/dashboard/timetable') },
  { to: '/dashboard/marks', label: 'Marks', match: (p: string) => p.startsWith('/dashboard/marks') },
  { to: '/map', label: 'Live map', match: (p: string) => p.startsWith('/map') },
]
const STUDENT_LINKS = [
  { to: '/me', label: 'My attendance', match: (p: string) => p.startsWith('/me') || p.startsWith('/scan') },
  { to: '/map', label: 'Live map', match: (p: string) => p.startsWith('/map') },
]
const VISITOR_LINKS = [{ to: '/map', label: 'Live map', match: (p: string) => p.startsWith('/map') }]

export function AppNav() {
  const { session, isStaff, signOut } = useAuth()
  const device = useDeviceKind()
  const { pathname } = useLocation()
  const staff = Boolean(session && isStaff)
  const links = staff ? STAFF_LINKS : device === 'phone' ? STUDENT_LINKS : VISITOR_LINKS

  const linkClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <nav className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        <Link to={staff ? '/dashboard' : '/'} className="mr-2 flex shrink-0 items-center gap-1.5 text-primary">
          <BrandMark className="h-4 w-4" />
          <span className="font-display text-sm font-semibold tracking-tight">Naksha</span>
        </Link>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className={linkClass(l.match(pathname))}>
            {l.label}
          </Link>
        ))}
      </div>
      {session ? (
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => signOut()}>
          Sign out
        </Button>
      ) : device === 'phone' ? (
        <Link to="/login" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
          Staff
        </Link>
      ) : (
        <Button asChild size="sm" className="shrink-0">
          <Link to="/login">Staff sign in</Link>
        </Button>
      )}
    </nav>
  )
}
