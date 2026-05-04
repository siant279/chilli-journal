'use client'

import type { WalkHighlight } from '@/lib/highlightedWalks'

const ICON: Record<WalkHighlight['kind'], string> = {
  longest_outing: '⏱️',
  most_elevation: '🏔️',
  furthest_from_home: '🧭',
}

export default function RecordSpotlights({ highlights }: { highlights: WalkHighlight[] }) {
  if (!highlights.length) return null

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: 10,
        letterSpacing: '0.14em',
        color: 'var(--muted)',
        marginBottom: 12,
        textAlign: 'center',
      }}>
        RECORD WALKS
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}>
        {highlights.map(h => (
          <a
            key={h.kind}
            href={`#journal-entry-${h.entry.id}`}
            style={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              background: 'linear-gradient(145deg, #faf6ee 0%, var(--cream) 100%)',
              border: '1px solid var(--accent)',
              borderRadius: 14,
              padding: '14px 14px 12px',
              boxShadow: '0 2px 12px rgba(124, 58, 237, 0.08)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div style={{
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'var(--accent)',
              fontFamily: "'Courier Prime', monospace",
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span aria-hidden>{ICON[h.kind]}</span>
              {h.badge.toUpperCase()}
            </div>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 15,
              fontWeight: 700,
              fontStyle: 'italic',
              color: 'var(--ink)',
              lineHeight: 1.25,
              marginBottom: 8,
            }}>
              {h.title}
            </div>
            <div style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: 18,
              fontWeight: 900,
              color: 'var(--ink)',
              marginBottom: 4,
            }}>
              {h.stat}
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: "'Lora', serif",
              fontStyle: 'italic',
            }}>
              {h.sub}
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
