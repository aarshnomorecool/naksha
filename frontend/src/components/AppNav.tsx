import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const links = [
  { to: '/checkin', label: 'Student' },
  { to: '/dashboard', label: 'Mentor' },
  { to: '/map', label: 'College live map' },
]

export function AppNav() {
  const { session, signOut } = useAuth()
  const location = useLocation()

  const linkClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <nav className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        <Link to="/" className="mr-2 flex shrink-0 items-center gap-1.5 text-primary">
          <BrandMark className="h-4 w-4" />
          <span className="font-display text-sm font-semibold tracking-tight">Naksha</span>
        </Link>
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={cn('shrink-0', linkClass(location.pathname.startsWith(l.to)))}
          >
            {l.label}
          </Link>
        ))}
      </div>
      {session ? (
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      ) : (
        <Link to="/login" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
          Mentor sign in
        </Link>
      )}
    </nav>
  )
}
