import { cookies } from 'next/headers'
import { ADMIN_COOKIE, adminSessionToken } from '@/lib/adminAuth'
import AdminLoginClient from '@/components/AdminLoginClient'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const expected = adminSessionToken()
  const got = cookies().get(ADMIN_COOKIE)?.value
  const unlocked = Boolean(expected && got && got === expected)

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        padding: '48px 20px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            color: 'var(--ink)',
            marginBottom: 8,
          }}
        >
          Journal admin
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 28 }}>
          Owner-only tools. Not linked from the public site.
        </p>
        <AdminLoginClient unlocked={unlocked} configured={Boolean(expected)} />
      </div>
    </main>
  )
}
