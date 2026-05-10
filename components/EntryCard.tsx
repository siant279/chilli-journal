import type { EntryWithStats } from '@/lib/supabase'
import { activityStartLocationLabel } from '@/lib/geo'
import { tempCToF } from '@/lib/weather'

const MOOD: Record<string, { emoji: string; color: string; border: string; label: string }> = {
  EPIC:       { emoji: '🐺', color: '#5b21b6', border: '#7c3aed', label: 'EPIC' },
  EXCELLENT:  { emoji: '⭐', color: '#92400e', border: '#d97706', label: 'EXCELLENT' },
  SOLID:      { emoji: '🐾', color: '#065f46', border: '#10b981', label: 'SOLID' },
  SUSPICIOUS: { emoji: '🐿️', color: '#7f1d1d', border: '#ef4444', label: 'SUSPICIOUS' },
  CHAOTIC:    { emoji: '🌪️', color: '#0e7490', border: '#06b6d4', label: 'CHAOTIC' },
}

function fmt(d: number | null | undefined, unit: string) {
  if (!d) return null
  return unit === 'mi' ? `${(d / 1609.34).toFixed(1)}mi`
       : unit === 'ft' ? `${Math.round(d * 3.28084)}ft`
       : unit === 'dur' ? formatDur(d)
       : String(d)
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function EntryCard({ entry }: { entry: EntryWithStats }) {
  const m = MOOD[entry.mood] || MOOD.SOLID
  const date = new Date(entry.start_date)
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  })
  const locationStr = activityStartLocationLabel(entry)
  const stravaHref = `https://www.strava.com/activities/${entry.strava_id}`

  const stats = [
    fmt(entry.distance_meters, 'mi'),
    entry.total_elevation_gain > 5 ? fmt(entry.total_elevation_gain, 'ft') + ' ↑' : null,
    fmt(entry.moving_time_seconds, 'dur'),
  ].filter(Boolean)

  return (
    <article
      id={`journal-entry-${entry.id}`}
      style={{
      background: 'var(--cream)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 28,
      boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
      scrollMarginTop: 24,
    }}
    >
      {/* Photo */}
      {entry.photo_urls && entry.photo_urls.length > 0 && (
        <div style={{ position: 'relative' }}>
          <img
            src={entry.photo_urls[0]}
            alt={entry.title}
            style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(16,6,0,0.6) 0%, transparent 50%)',
          }} />
          <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {/* Mood badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 99,
              background: 'rgba(255,255,255,0.9)',
              border: `1px solid ${m.border}`,
              fontSize: 10, fontWeight: 800, color: m.color,
              fontFamily: "'Courier Prime', monospace", letterSpacing: '0.1em',
            }}>
              {m.emoji} {m.label}
            </span>
            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {stats.map(s => (
                <span key={s} style={{
                  background: 'rgba(255,255,255,0.85)',
                  padding: '4px 10px', borderRadius: 8,
                  fontSize: 11, fontWeight: 800, color: 'var(--ink)',
                  fontFamily: "'Courier Prime', monospace",
                }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 22px 22px' }}>
        {/* Mood badge (no photo) */}
        {(!entry.photo_urls || entry.photo_urls.length === 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 99,
              border: `1px solid ${m.border}`,
              background: 'rgba(255,255,255,0.6)',
              fontSize: 10, fontWeight: 800, color: m.color,
              fontFamily: "'Courier Prime', monospace", letterSpacing: '0.1em',
            }}>
              {m.emoji} {m.label}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {stats.map(s => (
                <span key={s} style={{
                  background: 'var(--parchment-dark)',
                  padding: '3px 10px', borderRadius: 8,
                  fontSize: 11, fontWeight: 800, color: 'var(--muted)',
                  fontFamily: "'Courier Prime', monospace",
                }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22, fontWeight: 900, fontStyle: 'italic',
          color: 'var(--ink)', lineHeight: 1.15, marginBottom: 4,
        }}>
          {entry.title}
        </h2>

        {/* Date · time · location · weather · Strava */}
        <div style={{
          fontSize: 11, color: 'var(--muted)',
          fontFamily: "'Courier Prime', monospace",
          marginBottom: 16, letterSpacing: '0.04em',
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span>{dateStr}</span>
          <span>{timeStr} PT</span>
          {locationStr && (
            <span title="Location">
              📍 {locationStr}
            </span>
          )}
          {entry.weather_temp_c !== null && (
            <span>
              {entry.weather_condition || 'Weather'} · {tempCToF(entry.weather_temp_c)}°F
            </span>
          )}
          {entry.sport_type && (
            <span style={{
              background: 'var(--parchment-dark)', padding: '1px 8px',
              borderRadius: 99, fontSize: 10,
            }}>
              {entry.sport_type}
            </span>
          )}
          <a
            href={stravaHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 700,
              color: 'var(--strava)',
              textDecoration: 'none',
              borderBottom: '1px solid rgba(252, 76, 2, 0.35)',
            }}
          >
            View route on Strava ↗
          </a>
        </div>

        {/* Entry text */}
        <div style={{
          fontSize: 15, lineHeight: 1.82, color: 'var(--ink-light)',
          fontFamily: "'Lora', serif",
          borderLeft: `3px solid ${m.border}`,
          paddingLeft: 16, marginBottom: 16,
          whiteSpace: 'pre-wrap',
        }}>
          {entry.entry}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(entry.tags || []).map(tag => (
            <span key={tag} style={{
              background: '#f0e4d0', color: '#7a5030',
              padding: '3px 10px', borderRadius: 99,
              fontSize: 11, fontWeight: 600,
              fontFamily: "'Courier Prime', monospace",
            }}>
              #{tag.replace(/\s+/g, '_')}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}
