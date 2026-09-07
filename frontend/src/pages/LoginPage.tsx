import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { hasSupabaseConfig } from '@/lib/supabase'

// No invite/role system yet — any Supabase Auth account can view the mentor
// dashboard, so sign-up is self-serve here rather than admin-provisioned.
// Note: if the Supabase project has "Confirm email" enabled (the default),
// a new account needs that confirmation click before signIn will succeed.
export function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const errMsg = mode === 'signin' ? await signIn(email, password) : await signUp(email, password)
    setSubmitting(false)
    if (errMsg) {
      setError(errMsg)
    } else if (mode === 'signup') {
      setInfo('Account created. If email confirmation is required, confirm it, then sign in.')
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Mentor sign in' : 'Create mentor account'}</CardTitle>
          <CardDescription>NAKSHA dashboard access — attendance and risk data are DPDP-sensitive.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSupabaseConfig && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Supabase isn't configured (missing VITE_SUPABASE_URL/ANON_KEY) — sign-in is unavailable.
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {info && <p className="text-xs text-emerald-600">{info}</p>}
            <Button type="submit" disabled={submitting || !hasSupabaseConfig} className="mt-1">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setInfo(null)
            }}
            className="mt-4 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
