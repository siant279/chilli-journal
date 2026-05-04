'use client'

import { useMemo, useState } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import type { WalkHighlight } from '@/lib/highlightedWalks'
import { haversineMeters } from '@/lib/geo'
import EntryCard from './EntryCard'
import RecordSpotlights from './RecordSpotlights'
import StatsDashboard from './StatsDashboard'
import BackToTop from './BackToTop'

type Props = {
  initialEntries: EntryWithStats[]
  stats: any
  stravaConnected: boolean
  chartStartDates: string[]
  recordWalks: WalkHighlight[]
  homeCoords: { lat: number; lng: number } | null
}

type SortKey = 'date' | 'distance' | 'elevation' | 'from_home'

function compareEntries(
  a: EntryWithStats,
  b: EntryWithStats,
  key: SortKey,
  desc: boolean,
  home: { lat: number; lng: number } | null
): number {
  const t = (e: EntryWithStats) => new Date(e.start_date).getTime()
  const fromHomeM = (e: EntryWithStats): number | null => {
    if (!home || e.start_lat == null || e.start_lng == null) return null
    return haversineMeters(home.lat, home.lng, e.start_lat, e.start_lng)
  }

  let c = 0
  switch (key) {
    case 'date':
      c = t(a) - t(b)
      break
    case 'distance':
      c = a.distance_meters - b.distance_meters
      break
    case 'elevation':
      c = a.total_elevation_gain - b.total_elevation_gain
      break
    case 'from_home': {
      const ha = fromHomeM(a)
      const hb = fromHomeM(b)
      if (ha != null && hb != null) c = ha - hb
      else if (ha != null && hb == null) c = -1
      else if (ha == null && hb != null) c = 1
      else c = t(b) - t(a)
      break
    }
  }
  if (c === 0) c = t(b) - t(a)
  return desc ? -c : c
}

function sortJournalEntries(
  entries: EntryWithStats[],
  key: SortKey,
  desc: boolean,
  home: { lat: number; lng: number } | null
): EntryWithStats[] {
  return [...entries].sort((a, b) => compareEntries(a, b, key, desc, home))
}

export default function JournalClient({
  initialEntries,
  stats,
  stravaConnected,
  chartStartDates,
  recordWalks,
  homeCoords,
}: Props) {
  const [view, setView] = useState<'journal' | 'stats'>('journal')
  const [filter, setFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDesc, setSortDesc] = useState(true)

  const moods = ['all', 'EPIC', 'EXCELLENT', 'SOLID', 'SUSPICIOUS', 'CHAOTIC']
  const filtered = filter === 'all'
    ? initialEntries
    : initialEntries.filter(e => e.mood === filter)

  const sorted = useMemo(
    () => sortJournalEntries(filtered, sortKey, sortDesc, homeCoords),
    [filtered, sortKey, sortDesc, homeCoords],
  )

  const sortToggleLabel =
    sortKey === 'date'
      ? sortDesc
        ? 'Newest first'
        : 'Oldest first'
      : sortKey === 'distance'
        ? sortDesc
          ? 'Longest first'
          : 'Shortest first'
        : sortKey === 'elevation'
          ? sortDesc
            ? 'Most gain first'
            : 'Least gain first'
          : sortDesc
            ? 'Furthest from home first'
            : 'Nearest home first'

  const sortBtn = (active: boolean) => ({
    padding: '5px 12px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? '#ede8ff' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--muted)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Courier Prime', monospace",
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)' }}>
      <header
        id="page-top"
        style={{
          background: 'var(--ink)',
          padding: '40px 20px 28px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🐺</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 32, fontWeight: 900, fontStyle: 'italic',
            color: '#f5e0c0', letterSpacing: '-0.01em', marginBottom: 4,
          }}>
            Chilli&apos;s Adventure Journal
          </h1>
          <p style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10, letterSpacing: '0.14em',
            color: '#6a4a2a', marginBottom: 20,
          }}>
            DISPATCHES FROM THE SIERRA NEVADA · TRUCKEE, CA
          </p>

          {stats && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
              {[
                { v: stats.totalAdventures, l: 'ADVENTURES' },
                { v: `${stats.totalMiles}mi`, l: 'ON RECORD' },
                { v: `${stats.totalHours}h`, l: 'TIME OUT' },
                { v: stats.topSeason, l: 'FAV SEASON' },
              ].map(({ v, l }) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#e8c090', fontFamily: "'Courier Prime', monospace" }}>{v}</div>
                  <div style={{ fontSize: 9, color: '#5a3a1a', letterSpacing: '0.1em', fontFamily: "'Courier Prime', monospace" }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {!stravaConnected && (
            <a href="/api/strava/connect" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 16, padding: '8px 20px', borderRadius: 99,
              background: '#fc4c02', color: '#fff', textDecoration: 'none',
              fontFamily: "'Courier Prime', monospace", fontSize: 12, fontWeight: 700,
              letterSpacing: '0.06em',
            }}>
              🏅 Connect Strava
            </a>
          )}
        </div>
      </header>

      <nav style={{ borderBottom: '2px solid var(--border)', background: 'var(--parchment-dark)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex' }}>
          {[['journal', '📖 Journal'], ['stats', '📊 Stats']].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v as 'journal' | 'stats')}
              style={{
                padding: '12px 24px', border: 'none',
                borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
                background: 'transparent',
                color: view === v ? 'var(--ink)' : 'var(--muted)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Courier Prime', monospace", letterSpacing: '0.07em',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>

        {view === 'stats' && stats && (
          <StatsDashboard stats={stats} entries={initialEntries} chartStartDates={chartStartDates} />
        )}

        {view === 'journal' && (
          <>
            <RecordSpotlights highlights={recordWalks} />

            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: 10,
                letterSpacing: '0.12em',
                color: 'var(--muted)',
                marginBottom: 8,
              }}>
                SORT BY
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                {([
                  ['date', 'Date'],
                  ['distance', 'Distance'],
                  ['elevation', 'Elevation'],
                  ['from_home', 'From home'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={k === 'from_home' && !homeCoords}
                    title={k === 'from_home' && !homeCoords ? 'Set HOME_LAT and HOME_LNG in env' : undefined}
                    onClick={() => setSortKey(k)}
                    style={{
                      ...sortBtn(sortKey === k),
                      opacity: k === 'from_home' && !homeCoords ? 0.45 : 1,
                      cursor: k === 'from_home' && !homeCoords ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setSortDesc(d => !d)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--cream)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: "'Courier Prime', monospace",
                    color: 'var(--ink)',
                  }}
                >
                  Order: {sortToggleLabel} ⇄
                </button>
              </div>
            </div>

            {/* Mood filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: 10,
                letterSpacing: '0.12em',
                color: 'var(--muted)',
                marginRight: 4,
              }}>
                MOOD
              </span>
              {moods.map(mood => (
                <button
                  key={mood}
                  type="button"
                  onClick={() => setFilter(mood)}
                  style={{
                    padding: '5px 14px', borderRadius: 99,
                    border: `1px solid ${filter === mood ? 'var(--accent)' : 'var(--border)'}`,
                    background: filter === mood ? '#ede8ff' : 'transparent',
                    color: filter === mood ? 'var(--accent)' : 'var(--muted)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Courier Prime', monospace", letterSpacing: '0.07em',
                    transition: 'all 0.15s',
                  }}
                >
                  {mood === 'all' ? 'ALL' : mood}
                </button>
              ))}
            </div>

            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>🐾</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontStyle: 'italic', marginBottom: 8 }}>
                  {initialEntries.length === 0
                    ? 'No adventures yet.'
                    : 'No entries match this filter.'}
                </div>
                {initialEntries.length === 0 && (
                  <div style={{ fontSize: 12, color: '#b0a080', fontFamily: "'Courier Prime', monospace" }}>
                    Connect Strava and run the historical import to populate the journal.
                  </div>
                )}
              </div>
            ) : (
              sorted.map(entry => <EntryCard key={entry.id} entry={entry} />)
            )}
          </>
        )}
      </main>

      <BackToTop />
    </div>
  )
}
