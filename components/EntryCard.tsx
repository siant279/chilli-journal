import type { EntryWithStats } from '@/lib/supabase'
import { activityStartLocationLabel } from '@/lib/geo'
import { getMoodStyle } from '@/lib/mood'
import { tempCToF } from '@/lib/weather'

function fmt(d: number | null | undefined, unit: string) {
  if (!d) return null
  return unit === 'mi'
    ? `${(d / 1609.34).toFixed(1)}mi`
    : unit === 'ft'
      ? `${Math.round(d * 3.28084)}ft`
      : unit === 'dur'
        ? formatDur(d)
        : String(d)
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function EntryCard({ entry }: { entry: EntryWithStats }) {
  const m = getMoodStyle(entry.mood)
  const date = new Date(entry.start_date)
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        marginBottom: 28,
        boxShadow: 'var(--shadow)',
        scrollMarginTop: 24,
      }}
    >
      {entry.photo_urls && entry.photo_urls.length > 0 && (
        <div style={{ position: 'relative' }}>
          <img
            src={entry.photo_urls[0]}
            alt={entry.title}
            style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(20, 30, 25, 0.55) 0%, transparent 50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 16,
              right: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(255,255,255,0.92)',
                border: `1px solid ${m.border}`,
                fontSize: 10,
                fontWeight: 700,
                color: m.color,
                fontFamily: 'var(--font-label)',
                letterSpacing: '0.06em',
              }}
            >
              {m.emoji} {m.label}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {stats.map(s => (
                <span
                  key={s}
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-button)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-label)',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 22px 22px' }}>
        {(!entry.photo_urls || entry.photo_urls.length === 0) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${m.border}`,
                background: 'var(--surface-alt)',
                fontSize: 10,
                fontWeight: 700,
                color: m.color,
                fontFamily: 'var(--font-label)',
                letterSpacing: '0.06em',
              }}
            >
              {m.emoji} {m.label}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {stats.map(s => (
                <span
                  key={s}
                  style={{
                    background: 'var(--surface-alt)',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-button)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-label)',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--ink)',
            lineHeight: 1.2,
            marginBottom: 4,
          }}
        >
          {entry.title}
        </h2>

        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-label)',
            marginBottom: 16,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span>{dateStr}</span>
          <span>{timeStr} PT</span>
          {locationStr && <span>📍 {locationStr}</span>}
          {entry.weather_temp_c !== null && (
            <span>
              {entry.weather_condition || 'Weather'} · {tempCToF(entry.weather_temp_c)}°F
            </span>
          )}
          {entry.sport_type && (
            <span
              style={{
                background: 'var(--surface-alt)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 10,
              }}
            >
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
              fontWeight: 600,
              color: 'var(--strava)',
              textDecoration: 'none',
              borderBottom: '1px solid rgba(252, 76, 2, 0.35)',
            }}
          >
            View route on Strava ↗
          </a>
        </div>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.75,
            color: 'var(--ink-light)',
            fontFamily: 'var(--font-sans)',
            borderLeft: `3px solid ${m.border}`,
            paddingLeft: 16,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
          }}
        >
          {entry.entry}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(entry.tags || []).map(tag => (
            <span
              key={tag}
              style={{
                background: 'var(--tag-bg)',
                color: 'var(--tag-text)',
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-label)',
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
