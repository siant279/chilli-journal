'use client'

import { Inter, Lora, Fraunces, Source_Sans_3 } from 'next/font/google'
import type { EntryWithStats } from '@/lib/supabase'
import { DESIGN_THEMES } from '@/lib/designThemes'
import ThemePreviewColumn from './ThemePreviewColumn'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-preview-inter',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-preview-lora',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-preview-fraunces',
  display: 'swap',
})

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-preview-source-sans',
  display: 'swap',
})

type Props = {
  entry: EntryWithStats
  usingFixture: boolean
}

export default function DesignPreviewShell({ entry, usingFixture }: Props) {
  return (
    <div
      className={`${inter.variable} ${lora.variable} ${fraunces.variable} ${sourceSans.variable}`}
      style={{
        minHeight: '100vh',
        background: '#e8e6e1',
        padding: '24px 16px 48px',
      }}
    >
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <header style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: 'var(--font-preview-inter), system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 600,
              color: '#2c3440',
              marginBottom: 8,
            }}
          >
            Design preview — pick a direction
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-preview-inter), system-ui, sans-serif',
              fontSize: 14,
              color: '#5a6570',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            Compare three themes side by side. The live journal is unchanged until you choose one.
            {usingFixture ? ' (Showing sample copy — no Supabase entry loaded.)' : ''}
          </p>
          <p style={{ marginTop: 12 }}>
            <a
              href="/"
              style={{
                fontFamily: 'var(--font-preview-inter), system-ui, sans-serif',
                fontSize: 13,
                color: '#4a7c59',
              }}
            >
              ← Back to live journal
            </a>
          </p>
        </header>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          {DESIGN_THEMES.map(theme => (
            <ThemePreviewColumn key={theme.id} theme={theme} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  )
}
