import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  // false only when the server positively says this account isn't staff.
  isStaff: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Being signed in isn't enough to see student data: the account must be in
// the `staff` table (supabase/migrations/0007_staff_role.sql). RLS enforces
// that on every table; isStaff here only decides what the UI shows, so a
// failed check (e.g. 0007 not applied yet) falls back to letting RLS decide.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isStaff, setIsStaff] = useState(true)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [staffLoading, setStaffLoading] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!supabase || !userId) {
      setIsStaff(true)
      return
    }
    let cancelled = false
    setStaffLoading(true)
    supabase
      .rpc('is_staff')
      .then(({ data, error }) => {
        if (!cancelled) setIsStaff(error ? true : data === true)
      })
      .then(() => {
        if (!cancelled) setStaffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function signIn(email: string, password: string) {
    if (!supabase) return 'Supabase is not configured.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, isStaff, loading: sessionLoading || staffLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
