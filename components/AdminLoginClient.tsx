'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  unlocked: boolean
  configured: boolean
}

export default function AdminLoginClient({ unlocked, configured }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || 'Login failed')
        return
      }
      setPassword('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/admin/login', { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <p style={{ fontSize: 14, color: '#b45309' }}>
        Set <code>ADMIN_PASSWORD</code> in the environment, then redeploy.
      </p>
    )
  }

  if (unlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--accent)', margin: 0 }}>Unlocked.</p>
        <a
          href="/api/strava/connect"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 18px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--strava)',
            color: '#fff',
            textDecoration: 'none',
            fontFamily: 'var(--font-label)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Connect / reconnect Strava
        </a>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={busy}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 14px',
            borderRadius: 'var(--radius-button)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-label)',
            fontSize: 12,
          }}
        >
          Lock
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{
            display: 'block',
            width: '100%',
            marginTop: 8,
            padding: '10px 12px',
            borderRadius: 'var(--radius-button)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 15,
            fontFamily: 'var(--font-sans)',
            boxSizing: 'border-box',
          }}
        />
      </label>
      {error && (
        <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>{error}</p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        style={{
          padding: '10px 18px',
          borderRadius: 'var(--radius-pill)',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontFamily: 'var(--font-label)',
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy || !password ? 0.6 : 1,
        }}
      >
        Unlock
      </button>
    </form>
  )
}
