import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { hasSupabaseConfig } from '@/lib/supabase'

// Sign-in only. Staff accounts are created by an admin (Supabase → Add user,
// then added to the `staff` table — see supabase/migrations/0007_staff_role.sql).
// Self sign-up would let students into DPDP-sensitive data.
export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const errMsg = await signIn(email, password)
    setSubmitting(false)
    if (errMsg) setError(errMsg)
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Mentor sign in</CardTitle>
          <CardDescription>For college staff. Attendance and student data are DPDP-sensitive.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSupabaseConfig && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Supabase isn't configured (missing VITE_SUPABASE_URL/ANON_KEY), so sign-in is unavailable.
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting || !hasSupabaseConfig} className="mt-1">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            No account? Ask your college admin to add you as staff.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
