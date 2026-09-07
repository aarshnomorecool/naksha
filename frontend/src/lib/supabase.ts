import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// No project configured yet -> app falls back to simulation mode (see MapView).
// Never hardcode real credentials here; they come from .env (git-ignored).
export const hasSupabaseConfig = Boolean(url && anonKey)

export const supabase = url && anonKey ? createClient(url, anonKey) : null
