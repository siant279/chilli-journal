'use client'

import type { CSSProperties } from 'react'
import type { WalkHighlight } from '@/lib/highlightedWalks'

const ICON: Record<WalkHighlight['kind'], string> = {
  longest_outing: '⏱️',
  most_elevation: '🏔️',
  furthest_from_home: '🧭',
}

type Props = {
  highlights: WalkHighlight[]
  onSelectEntry?: (entryId: string) => void
}

export default function RecordSpotlights({ highlights, onSelectEntry }: Props) {
  if (!highlights.length) return null

  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Record walks
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {highlights.map(h => {
          const inner = (
            <>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-label)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span aria-hidden>{ICON[h.kind]}</span>
                {h.badge}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  lineHeight: 1.25,
                  marginBottom: 8,
                }}
              >
                {h.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-label)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--stat-value)',
                  marginBottom: 4,
                }}
              >
                {h.stat}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {h.sub}
              </div>
            </>
          )

          const cardStyle: CSSProperties = {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            textDecoration: 'none',
            color: 'inherit',
            background: 'var(--surface)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-card)',
            padding: '14px 14px 12px',
            boxShadow: 'var(--shadow)',
            transition: 'transform 0.15s ease',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }

          if (onSelectEntry) {
            return (
              <button
                key={h.kind}
                type="button"
                onClick={() => onSelectEntry(h.entry.id)}
                style={cardStyle}
              >
                {inner}
              </button>
            )
          }

          return (
            <a key={h.kind} href={`#journal-entry-${h.entry.id}`} style={cardStyle}>
              {inner}
            </a>
          )
        })}
      </div>
    </section>
  )
}
