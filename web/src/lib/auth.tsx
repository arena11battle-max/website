import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, onSessionLost, refreshSession, setAccessToken } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  ready: boolean
  needsSetup: boolean
  login: (email: string, password: string) => Promise<void>
  setup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

interface Session {
  accessToken: string
  user: User
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    onSessionLost(() => {
      setAccessToken(null)
      setUser(null)
    })
    ;(async () => {
      try {
        if (await refreshSession()) {
          const me = await api<{ user: User }>('GET', '/api/auth/me')
          setUser(me.user)
        } else {
          const status = await api<{ needsSetup: boolean }>('GET', '/api/auth/status')
          setNeedsSetup(status.needsSetup)
        }
      } catch {
        // Server unreachable; the login screen shows the error on the next try.
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const begin = (s: Session) => {
    setAccessToken(s.accessToken)
    setUser(s.user)
    setNeedsSetup(false)
  }

  const login = useCallback(async (email: string, password: string) => {
    begin(await api<Session>('POST', '/api/auth/login', { email, password }))
  }, [])

  const setup = useCallback(async (name: string, email: string, password: string) => {
    begin(await api<Session>('POST', '/api/auth/setup', { name, email, password }))
  }, [])

  const logout = useCallback(async () => {
    await api('POST', '/api/auth/logout', {}).catch(() => {})
    setAccessToken(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, ready, needsSetup, login, setup, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
