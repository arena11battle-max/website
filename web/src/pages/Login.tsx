import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Layout'
import { Button, ErrorText, Field } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login, setup, needsSetup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (needsSetup) await setup(name, email, password)
      else await login(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40" aria-hidden>
        <div className="radar h-[720px] w-[720px] shrink-0" />
      </div>
      <form onSubmit={submit} className="hud hud-corner relative w-full max-w-sm space-y-5 p-6 sm:p-8">
        <Logo />
        <div>
          <h1 className="font-display text-xl tracking-wider uppercase">{needsSetup ? 'Create owner account' : 'Staff sign in'}</h1>
          <div className="label mt-1 text-lime">{needsSetup ? 'Commander enlistment' : 'Command access · authorised staff only'}</div>
          <p className="mt-1 text-sm text-muted">
            {needsSetup ? 'First run. This account will be the admin and can add other staff later.' : 'Sign in to run matches and manage players.'}
          </p>
        </div>
        {needsSetup && <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={needsSetup ? 8 : undefined}
          autoComplete={needsSetup ? 'new-password' : 'current-password'}
          hint={needsSetup ? 'At least 8 characters' : undefined}
        />
        <ErrorText error={error} />
        <Button variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in'}
        </Button>
        <a href="/" className="block text-center text-xs uppercase tracking-[0.2em] text-muted hover:text-text">
          ← Back to the ARENA11 website
        </a>
      </form>
    </div>
  )
}
