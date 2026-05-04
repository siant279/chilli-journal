'use client'

import { useState } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import EntryCard from './EntryCard'
import StatsDashboard from './StatsDashboard'

type Props = {
  initialEntries: EntryWithStats[]
  stats: any
  stravaConnected: boolean
  chartStartDates: string[]
}

export default function JournalClient({ initialEntries, stats, stravaConnected, chartStartDates }: Props) {
  const [view, setView] = useState<'journal' | 'stats'>('journal')
  const [filter, setFilter] = useState<string>('all')

  const moods = ['all', 'EPIC', 'EXCELLENT', 'SOLID', 'SUSPICIOUS', 'CHAOTIC']
  const filtered = filter === 'all'
    ? initialEntries
    : initialEntries.filter(e => e.mood === filter)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--ink)',
        padding: '40px 20px 28px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
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

          {/* Stats summary strip */}
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

          {/* Strava connect banner */}
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

      {/* Nav */}
      <nav style={{ borderBottom: '2px solid var(--border)', background: 'var(--parchment-dark)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex' }}>
          {[['journal', '📖 Journal'], ['stats', '📊 Stats']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v as any)}
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

      {/* Content */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>

        {view === 'stats' && stats && (
          <StatsDashboard stats={stats} entries={initialEntries} chartStartDates={chartStartDates} />
        )}

        {view === 'journal' && (
          <>
            {/* Mood filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {moods.map(mood => (
                <button
                  key={mood}
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

            {filtered.length === 0 ? (
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
              filtered.map(entry => <EntryCard key={entry.id} entry={entry} />)
            )}
          </>
        )}
      </main>
    </div>
  )
}
