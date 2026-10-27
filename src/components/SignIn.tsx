import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Email + password sign-in. Email codes/links aren't an option: the free Supabase tier can't
 * customise email templates (so no code), and links open in Safari rather than the home-screen app.
 * "Create account" is for the owner's first visit; new sign-ups are disabled in Supabase afterwards.
 */
export function SignIn({ db }: { db: SupabaseClient }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } =
      mode === 'signin' ? await db.auth.signInWithPassword({ email, password }) : await db.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(/signups? not allowed/i.test(error.message) ? 'New accounts are turned off. Sign in instead.' : error.message)
    else if (!data.session) setMsg('Account created. Check your email to confirm it, then sign in.')
  }

  return (
    <main className="signin">
      <h1>Gen 1 Binder</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMsg(null)
          }}
        >
          {mode === 'signin' ? 'First time here? Create your account' : 'Already have an account? Sign in'}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}
    </main>
  )
}
