import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

export function AppNav() {
  const { session, signOut } = useAuth()
  const location = useLocation()

  const linkClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <nav className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-1">
        <span className="mr-3 text-sm font-bold tracking-wide">NAKSHA</span>
        <Link to="/" className={linkClass(location.pathname === '/')}>
          Map
        </Link>
        <Link to="/dashboard" className={linkClass(location.pathname.startsWith('/dashboard'))}>
          Dashboard
        </Link>
      </div>
      {session ? (
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      ) : (
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Mentor sign in
        </Link>
      )}
    </nav>
  )
}
