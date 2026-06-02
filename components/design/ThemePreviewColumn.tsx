import type { EntryWithStats } from '@/lib/supabase'
import type { DesignTheme } from '@/lib/designThemes'
import { themeToCssVars } from '@/lib/designThemes'
import { PREVIEW_STATS } from '@/lib/designPreviewSample'
import ThemePreviewEntry from './ThemePreviewEntry'

type Props = {
  theme: DesignTheme
  entry: EntryWithStats
}

const MOODS = ['ALL', 'EPIC', 'SOLID', 'CHAOTIC'] as const

export default function ThemePreviewColumn({ theme, entry }: Props) {
  const cssVars = themeToCssVars(theme)
  const isTrail = theme.id === 'trail_soft'

  const chipStyle = (active: boolean) => ({
    padding: '5px 12px',
    borderRadius: 'var(--preview-radius-pill)',
    border: `1px solid ${active ? 'var(--preview-accent)' : 'var(--preview-border)'}`,
    background: active ? 'var(--preview-accent-soft)' : 'transparent',
    color: active ? 'var(--preview-accent)' : 'var(--preview-muted)',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'var(--preview-font-label)',
    cursor: 'default' as const,
  })

  return (
    <div
      style={{
        ...cssVars,
        flex: '1 1 300px',
        minWidth: 280,
        maxWidth: 400,
        background: 'var(--preview-bg)',
        borderRadius: isTrail ? 20 : 12,
        border: isTrail ? '1px solid var(--preview-border)' : 'none',
        overflow: 'hidden',
        boxShadow: isTrail ? 'var(--preview-shadow)' : 'none',
      }}
    >
      {/* Header */}
      <header
        style={{
          background: 'var(--preview-header-bg)',
          padding: '24px 16px 18px',
          textAlign: 'center',
          borderBottom: `1px solid var(--preview-border)`,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 6 }}>🐺</div>
        <h2
          style={{
            fontFamily: 'var(--preview-font-serif)',
            fontSize: theme.id === 'warm_journal' ? 20 : 18,
            fontWeight: theme.id === 'trail_soft' ? 500 : 600,
            fontStyle: theme.id === 'warm_journal' ? 'normal' : undefined,
            color: 'var(--preview-header-text)',
            marginBottom: 4,
          }}
        >
          Chilli&apos;s Journal
        </h2>
        <p
          style={{
            fontFamily: 'var(--preview-font-label)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--preview-header-sub)',
            marginBottom: 16,
          }}
        >
          Sierra Nevada · Truckee
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          {[
            { v: PREVIEW_STATS.totalAdventures, l: 'Adventures' },
            { v: `${PREVIEW_STATS.totalMiles}mi`, l: 'On record' },
            { v: `${PREVIEW_STATS.totalHours}h`, l: 'Time out' },
          ].map(({ v, l }) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--preview-stat-value)',
                  fontFamily: 'var(--preview-font-label)',
                }}
              >
                {v}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--preview-header-sub)',
                  fontFamily: 'var(--preview-font-label)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {l}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Nav */}
      <nav
        style={{
          background: 'var(--preview-nav-bg)',
          borderBottom: '1px solid var(--preview-border)',
          padding: isTrail ? '8px 12px' : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: isTrail ? 8 : 0,
            justifyContent: isTrail ? 'center' : 'flex-start',
          }}
        >
          {['Journal', 'Stats'].map((label, i) => (
            <span
              key={label}
              style={{
                padding: isTrail ? '8px 20px' : '10px 18px',
                borderRadius: isTrail ? 'var(--preview-radius-pill)' : 0,
                borderBottom: !isTrail && i === 0 ? '2px solid var(--preview-accent)' : '2px solid transparent',
                marginBottom: !isTrail ? -1 : 0,
                background: isTrail && i === 0 ? 'var(--preview-surface)' : 'transparent',
                color: i === 0 ? 'var(--preview-ink)' : 'var(--preview-muted)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--preview-font-label)',
              }}
            >
              {i === 0 ? '📖 ' : '📊 '}
              {label}
            </span>
          ))}
        </div>
      </nav>

      <div style={{ padding: '16px 14px 20px' }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--preview-muted)',
            fontFamily: 'var(--preview-font-label)',
            marginBottom: 8,
          }}
        >
          Mood
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {MOODS.map((m, i) => (
            <span key={m} style={chipStyle(i === 0)}>
              {m}
            </span>
          ))}
        </div>

        <ThemePreviewEntry entry={entry} />
      </div>

      <div
        style={{
          padding: '10px 14px 14px',
          borderTop: '1px solid var(--preview-border)',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--preview-accent)',
            fontFamily: 'var(--preview-font-label)',
          }}
        >
          {theme.name}
        </span>
        <p
          style={{
            fontSize: 10,
            color: 'var(--preview-muted)',
            marginTop: 4,
            lineHeight: 1.4,
            fontFamily: 'var(--preview-font-sans)',
          }}
        >
          {theme.tagline}
        </p>
      </div>
    </div>
  )
}
