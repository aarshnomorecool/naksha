import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isStaff, loading, signOut } = useAuth()

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (!isStaff) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="max-w-sm rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="font-display text-lg font-semibold">This account isn't set up as staff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as {session.user.email}, but only college staff can open this page. Ask your
            admin to add you, then sign in again.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
