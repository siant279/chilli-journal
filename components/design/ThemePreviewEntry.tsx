import type { EntryWithStats } from '@/lib/supabase'
import { activityStartLocationLabel } from '@/lib/geo'
import { tempCToF } from '@/lib/weather'

const MOOD: Record<string, { emoji: string; color: string; border: string }> = {
  EPIC: { emoji: '🐺', color: '#5b21b6', border: '#7c3aed' },
  EXCELLENT: { emoji: '⭐', color: '#92400e', border: '#d97706' },
  SOLID: { emoji: '🐾', color: '#065f46', border: '#10b981' },
  SUSPICIOUS: { emoji: '🐿️', color: '#7f1d1d', border: '#ef4444' },
  CHAOTIC: { emoji: '🌪️', color: '#0e7490', border: '#06b6d4' },
}

function fmtMi(m: number) {
  return `${(m / 1609.34).toFixed(1)}mi`
}

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

type Props = {
  entry: EntryWithStats
}

export default function ThemePreviewEntry({ entry }: Props) {
  const m = MOOD[entry.mood] || MOOD.SOLID
  const date = new Date(entry.start_date)
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  })
  const locationStr = activityStartLocationLabel(entry)
  const excerpt =
    entry.entry.length > 280 ? `${entry.entry.slice(0, 280).trim()}…` : entry.entry
  const stats = [
    fmtMi(entry.distance_meters),
    entry.moving_time_seconds ? fmtDur(entry.moving_time_seconds) : null,
  ].filter(Boolean)

  return (
    <article
      style={{
        background: 'var(--preview-surface)',
        border: '1px solid var(--preview-border)',
        borderRadius: 'var(--preview-radius-card)',
        overflow: 'hidden',
        boxShadow: 'var(--preview-shadow)',
      }}
    >
      {entry.photo_urls?.[0] ? (
        <div style={{ position: 'relative' }}>
          <img
            src={entry.photo_urls[0]}
            alt=""
            style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              padding: '4px 10px',
              borderRadius: 'var(--preview-radius-pill)',
              background: 'rgba(255,255,255,0.92)',
              border: `1px solid ${m.border}`,
              fontSize: 10,
              fontWeight: 700,
              color: m.color,
              fontFamily: 'var(--preview-font-label)',
            }}
          >
            {m.emoji} {entry.mood}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 14px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--preview-radius-pill)',
              border: `1px solid ${m.border}`,
              fontSize: 10,
              fontWeight: 700,
              color: m.color,
              fontFamily: 'var(--preview-font-label)',
            }}
          >
            {m.emoji} {entry.mood}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {stats.map(s => (
              <span
                key={s}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--preview-muted)',
                  fontFamily: 'var(--preview-font-label)',
                  background: 'var(--preview-surface-alt)',
                  padding: '3px 8px',
                  borderRadius: 'var(--preview-radius-button)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px 16px' }}>
        <h3
          style={{
            fontFamily: 'var(--preview-font-serif)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--preview-ink)',
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {entry.title}
        </h3>

        <div
          style={{
            fontSize: 11,
            color: 'var(--preview-muted)',
            fontFamily: 'var(--preview-font-label)',
            marginBottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span>{dateStr}</span>
          <span>{timeStr} PT</span>
          {locationStr && <span>📍 {locationStr}</span>}
          {entry.weather_temp_c != null && (
            <span>
              {entry.weather_condition || 'Weather'} · {tempCToF(entry.weather_temp_c)}°F
            </span>
          )}
        </div>

        <p
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: 'var(--preview-ink-light)',
            fontFamily: 'var(--preview-font-sans)',
            borderLeft: `3px solid ${m.border}`,
            paddingLeft: 12,
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {excerpt}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(entry.tags || []).slice(0, 3).map(tag => (
            <span
              key={tag}
              style={{
                background: 'var(--preview-tag-bg)',
                color: 'var(--preview-tag-text)',
                padding: '3px 10px',
                borderRadius: 'var(--preview-radius-pill)',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'var(--preview-font-label)',
              }}
            >
              #{tag.replace(/\s+/g, '_')}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}
