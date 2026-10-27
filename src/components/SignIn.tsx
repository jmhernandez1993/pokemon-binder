import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Email one-time code sign-in. A code (rather than only a magic link) matters on iPhone:
 * links open in Safari, not in the home-screen app, so the app itself would stay signed out.
 */
export function SignIn({ db }: { db: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } })
    setBusy(false)
    if (error) setMsg(error.message)
    else setSent(true)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await db.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg(error.message)
  }

  return (
    <main className="signin">
      <h1>Gen 1 Binder</h1>
      {!sent ? (
        <form onSubmit={send}>
          <label>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="muted">Enter the code sent to {email}, or open the link in the email.</p>
          <label>
            Code
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className="btn btn-link" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </form>
      )}
      {msg && <p className="error">{msg}</p>}
    </main>
  )
}
