import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env')
}

export const supabase = createClient(url, key)

const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`

export function readCachedSession() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session?.access_token || !session?.refresh_token) return null

    const userRaw = localStorage.getItem(`${storageKey}-user`)
    if (userRaw) {
      const user = JSON.parse(userRaw)?.user
      if (user) session.user = user
    }
    if (!session.user || !session.user.id) return null
    return session
  } catch {
    return null
  }
}