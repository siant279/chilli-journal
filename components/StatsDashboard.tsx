import type { EntryWithStats } from '@/lib/supabase'

type Props = {
  stats: {
    totalAdventures: number
    totalMiles: string
    totalElevFt: string
    totalHours: number
    avgMiles: string
    topSeason: string
    activityTypes: Record<string, number>
    seasons: Record<string, number>
  }
  entries: EntryWithStats[]
}

const MOOD_COLORS: Record<string, string> = {
  EPIC: '#7c3aed', EXCELLENT: '#d97706', SOLID: '#10b981',
  SUSPICIOUS: '#ef4444', CHAOTIC: '#06b6d4',
}

const SEASON_EMOJI: Record<string, string> = {
  Winter: '❄️', Spring: '🌸', Summer: '☀️', Fall: '🍂',
}

function StatBlock({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--cream)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 16px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 28, fontWeight: 900, color: 'var(--ink)',
        fontFamily: "'Courier Prime', monospace", lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em',
        fontFamily: "'Courier Prime', monospace", marginTop: 4,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function StatsDashboard({ stats, entries }: Props) {
  // Mood distribution
  const moodCounts = entries.reduce((acc: Record<string, number>, e) => {
    acc[e.mood] = (acc[e.mood] || 0) + 1
    return acc
  }, {})

  // Monthly activity trend (last 12 months)
  const now = new Date()
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    const count = entries.filter(e => {
      const ed = new Date(e.start_date)
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth()
    }).length
    return { label, count }
  })
  const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1)

  // Longest streak
  const sortedDates = entries
    .map(e => new Date(e.start_date).toDateString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()

  return (
    <div>
      {/* Big stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatBlock value={stats.totalAdventures} label="TOTAL ADVENTURES" />
        <StatBlock value={`${stats.totalMiles}mi`} label="MILES COVERED" />
        <StatBlock value={`${stats.totalElevFt}ft`} label="ELEVATION GAINED" />
        <StatBlock value={`${stats.totalHours}h`} label="TIME ADVENTURING" />
        <StatBlock value={`${stats.avgMiles}mi`} label="AVG PER WALK" />
        <StatBlock value={`${SEASON_EMOJI[stats.topSeason] || ''} ${stats.topSeason}`} label="FAVOURITE SEASON" />
      </div>

      {/* Monthly trend */}
      <div style={{
        background: 'var(--cream)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '20px 20px 16px', marginBottom: 20,
      }}>
        <h3 style={{
          fontFamily: "'Courier Prime', monospace", fontSize: 11,
          letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 16,
        }}>
          ADVENTURES PER MONTH (LAST 12 MONTHS)
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
          {monthlyData.map(({ label, count }) => (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'Courier Prime', monospace" }}>
                {count > 0 ? count : ''}
              </div>
              <div style={{
                width: '100%', borderRadius: 4,
                background: count > 0 ? 'var(--accent)' : 'var(--border)',
                height: count > 0 ? `${Math.max(8, (count / maxMonthly) * 60)}px` : '4px',
                opacity: count > 0 ? 0.8 : 0.4,
                transition: 'height 0.3s ease',
              }} />
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'Courier Prime', monospace" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mood distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{
          background: 'var(--cream)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '18px 16px',
        }}>
          <h3 style={{
            fontFamily: "'Courier Prime', monospace", fontSize: 11,
            letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 14,
          }}>MOOD BREAKDOWN</h3>
          {Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).map(([mood, count]) => (
            <div key={mood} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: MOOD_COLORS[mood] || '#ccc',
                width: `${(count / entries.length) * 100}%`,
                minWidth: 8, transition: 'width 0.3s ease',
              }} />
              <span style={{
                fontSize: 10, color: 'var(--muted)',
                fontFamily: "'Courier Prime', monospace",
                whiteSpace: 'nowrap',
              }}>
                {mood} ({count})
              </span>
            </div>
          ))}
        </div>

        <div style={{
          background: 'var(--cream)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '18px 16px',
        }}>
          <h3 style={{
            fontFamily: "'Courier Prime', monospace", fontSize: 11,
            letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 14,
          }}>BY SEASON</h3>
          {Object.entries(stats.seasons).sort((a, b) => b[1] - a[1]).map(([season, count]) => (
            <div key={season} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{SEASON_EMOJI[season]}</span>
              <div style={{
                height: 6, borderRadius: 3, background: '#c4a87a', flex: 1,
                maxWidth: `${(count / stats.totalAdventures) * 100}%`,
              }} />
              <span style={{
                fontSize: 10, color: 'var(--muted)',
                fontFamily: "'Courier Prime', monospace",
                whiteSpace: 'nowrap',
              }}>
                {season} ({count})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity types */}
      {Object.keys(stats.activityTypes).length > 1 && (
        <div style={{
          background: 'var(--cream)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '18px 16px',
        }}>
          <h3 style={{
            fontFamily: "'Courier Prime', monospace", fontSize: 11,
            letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 14,
          }}>ACTIVITY TYPES</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(stats.activityTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} style={{
                background: 'var(--parchment-dark)', borderRadius: 8,
                padding: '8px 14px', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 18, fontWeight: 900, color: 'var(--ink)',
                  fontFamily: "'Courier Prime', monospace",
                }}>{count}</div>
                <div style={{
                  fontSize: 10, color: 'var(--muted)',
                  fontFamily: "'Courier Prime', monospace",
                  letterSpacing: '0.06em',
                }}>{type.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
