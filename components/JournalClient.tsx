'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import type { WalkHighlight } from '@/lib/highlightedWalks'
import { haversineFromHome } from '@/lib/geo'
import { newestEntry } from '@/lib/journalTimeline'
import { parseJournalEntryIdFromHash } from '@/lib/journalDeepLink'
import {
  JOURNAL_LAYOUTS,
  LAYOUT_STORAGE_KEY,
  normalizeLayoutMode,
  type JournalLayoutMode,
} from '@/lib/journalLayouts'
import RecordSpotlights from './RecordSpotlights'
import StatsDashboard from './StatsDashboard'
import JournalEntriesView from './journal/JournalEntriesView'

type Props = {
  initialEntries: EntryWithStats[]
  stats: any
  stravaConnected: boolean
  stravaMessage?: 'connected' | 'error' | null
  chartStartDates: string[]
  recordWalks: WalkHighlight[]
  homeCoords: { lat: number; lng: number } | null
  deepLinkEntryId?: string | null
}

type SortKey = 'date' | 'distance' | 'elevation' | 'from_home'

function compareEntries(
  a: EntryWithStats,
  b: EntryWithStats,
  key: SortKey,
  desc: boolean,
  home: { lat: number; lng: number } | null,
): number {
  const t = (e: EntryWithStats) => new Date(e.start_date).getTime()
  const fromHomeM = (e: EntryWithStats): number | null => {
    if (!home) return null
    return haversineFromHome(home, e.start_lat, e.start_lng)
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
  home: { lat: number; lng: number } | null,
): EntryWithStats[] {
  return [...entries].sort((a, b) => compareEntries(a, b, key, desc, home))
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px',
    borderRadius: 'var(--radius-pill)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--muted)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-label)',
    transition: 'all 0.15s',
  }
}

export default function JournalClient({
  initialEntries,
  stats,
  stravaConnected,
  stravaMessage = null,
  chartStartDates,
  recordWalks,
  homeCoords,
  deepLinkEntryId = null,
}: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [view, setView] = useState<'journal' | 'stats'>('journal')
  const [filter, setFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDesc, setSortDesc] = useState(true)
  const [layout, setLayout] = useState<JournalLayoutMode>('split')
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkEntryId)
  const [layoutHydrated, setLayoutHydrated] = useState(false)
  const [deepLinkReady, setDeepLinkReady] = useState(false)
  const deepLinkTargetRef = useRef<string | null>(deepLinkEntryId)
  const deepLinkScrolledRef = useRef(false)

  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const moods = ['all', 'EPIC', 'EXCELLENT', 'SOLID', 'SUSPICIOUS', 'CHAOTIC']
  const filtered =
    filter === 'all' ? entries : entries.filter(e => e.mood === filter)

  const chronological = useMemo(
    () => sortJournalEntries(filtered, 'date', true, homeCoords),
    [filtered, homeCoords],
  )

  const sorted = useMemo(() => {
    if (layout === 'paginated') {
      return sortJournalEntries(filtered, sortKey, sortDesc, homeCoords)
    }
    return chronological
  }, [layout, filtered, sortKey, sortDesc, homeCoords, chronological])

  const latestEntry = useMemo(() => newestEntry(filtered), [filtered])

  useEffect(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
    setLayout(normalizeLayoutMode(stored))
    setLayoutHydrated(true)
  }, [])

  useEffect(() => {
    if (!layoutHydrated) return
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  }, [layout, layoutHydrated])

  useLayoutEffect(() => {
    const hashId = parseJournalEntryIdFromHash(window.location.hash)
    const targetId = deepLinkEntryId || hashId
    if (!targetId) {
      setDeepLinkReady(true)
      return
    }

    deepLinkTargetRef.current = targetId
    deepLinkScrolledRef.current = false
    setView('journal')
    setFilter('all')
    setSelectedId(targetId)

    if (initialEntries.some(e => e.id === targetId)) {
      setDeepLinkReady(true)
    }
  }, [deepLinkEntryId, initialEntries])

  useEffect(() => {
    const targetId = deepLinkTargetRef.current
    if (!targetId || deepLinkReady) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/journal/entry?id=${encodeURIComponent(targetId)}`)
        if (res.ok) {
          const entry = (await res.json()) as EntryWithStats
          if (!cancelled) {
            setEntries(prev => {
              if (prev.some(e => e.id === entry.id)) return prev
              return [...prev, entry].sort(
                (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
              )
            })
          }
        }
      } catch {
        // Best-effort — entry may be outside the loaded page window.
      } finally {
        if (!cancelled) setDeepLinkReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deepLinkReady, deepLinkEntryId, initialEntries])

  useEffect(() => {
    const onHashChange = () => {
      const hashId = parseJournalEntryIdFromHash(window.location.hash)
      if (!hashId) return
      deepLinkTargetRef.current = hashId
      deepLinkScrolledRef.current = false
      setView('journal')
      setFilter('all')
      setSelectedId(hashId)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!deepLinkReady) return
    if (!filtered.length) {
      setSelectedId(null)
      return
    }

    const target = deepLinkTargetRef.current
    if (target && filtered.some(e => e.id === target)) {
      setSelectedId(target)
      return
    }

    if (selectedId && filtered.some(e => e.id === selectedId)) return

    setSelectedId(latestEntry?.id ?? null)
  }, [deepLinkReady, filtered, selectedId, latestEntry])

  useEffect(() => {
    if (!deepLinkReady || !selectedId || deepLinkScrolledRef.current) return
    const target = deepLinkTargetRef.current
    if (!target || selectedId !== target) return

    const timer = window.setTimeout(() => {
      document.getElementById(`journal-entry-${selectedId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      deepLinkScrolledRef.current = true
    }, 200)
    return () => window.clearTimeout(timer)
  }, [deepLinkReady, selectedId, layout])

  const focusEntry = useCallback(
    (id: string) => {
      setSelectedId(id)
      if (layout === 'split') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    [layout],
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

  const mainMaxWidth = layout === 'split' ? 1100 : 680

  const activeLayoutMeta = JOURNAL_LAYOUTS.find(l => l.id === layout)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header
        id="page-top"
        style={{
          background: 'var(--header-bg)',
          padding: '36px 20px 28px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🐺</div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 600,
              color: 'var(--header-text)',
              marginBottom: 4,
            }}
          >
            Chilli&apos;s Adventure Journal
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--header-sub)',
              marginBottom: 20,
            }}
          >
            Dispatches from the Sierra Nevada · Truckee, CA
          </p>

          {stats && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
              {[
                { v: stats.totalAdventures, l: 'Adventures' },
                { v: `${stats.totalMiles}mi`, l: 'On record' },
                { v: `${stats.totalHours}h`, l: 'Time out' },
                { v: stats.topSeason, l: 'Fav season' },
              ].map(({ v, l }) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: 'var(--stat-value)',
                      fontFamily: 'var(--font-label)',
                    }}
                  >
                    {v}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--header-sub)',
                      fontFamily: 'var(--font-label)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!stravaConnected && (
            <a
              href="/api/strava/connect"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '8px 20px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--strava)',
                color: '#fff',
                textDecoration: 'none',
                fontFamily: 'var(--font-label)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Connect Strava
            </a>
          )}
          {stravaMessage === 'connected' && (
            <p
              style={{
                margin: '16px 0 0',
                fontSize: 12,
                color: 'var(--accent)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Strava connected — journal links will sync to new activities.
            </p>
          )}
          {stravaMessage === 'error' && (
            <p
              style={{
                margin: '16px 0 0',
                fontSize: 12,
                color: '#b45309',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Strava authorization failed. Please try again.
            </p>
          )}
        </div>
      </header>

      <nav style={{ borderBottom: '1px solid var(--border)', background: 'var(--nav-bg)' }}>
        <div style={{ maxWidth: mainMaxWidth, margin: '0 auto', display: 'flex' }}>
          {[
            ['journal', '📖 Journal'],
            ['stats', '📊 Stats'],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v as 'journal' | 'stats')}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderBottom:
                  view === v ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                background: 'transparent',
                color: view === v ? 'var(--ink)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-label)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: mainMaxWidth, margin: '0 auto', padding: '28px 16px' }}>
        {view === 'stats' && stats && (
          <StatsDashboard stats={stats} entries={entries} chartStartDates={chartStartDates} />
        )}

        {view === 'journal' && (
          <>
            <RecordSpotlights highlights={recordWalks} onSelectEntry={focusEntry} />

            <div style={{ marginBottom: 20 }}>
              <div style={labelStyle}>Layout</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {JOURNAL_LAYOUTS.map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayout(l.id)}
                    style={chip(layout === l.id)}
                    title={l.description}
                  >
                    {l.short}
                  </button>
                ))}
              </div>
              {activeLayoutMeta && (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: 1.45,
                  }}
                >
                  {activeLayoutMeta.description}
                </p>
              )}
            </div>

            {layout === 'paginated' && (
              <div style={{ marginBottom: 20 }}>
                <div style={labelStyle}>Sort by</div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  {(
                    [
                      ['date', 'Date'],
                      ['distance', 'Distance'],
                      ['elevation', 'Elevation'],
                      ['from_home', 'From home'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      disabled={k === 'from_home' && !homeCoords}
                      title={
                        k === 'from_home' && !homeCoords
                          ? 'Set HOME_LAT and HOME_LNG in env'
                          : undefined
                      }
                      onClick={() => setSortKey(k)}
                      style={{
                        ...chip(sortKey === k),
                        opacity: k === 'from_home' && !homeCoords ? 0.45 : 1,
                        cursor:
                          k === 'from_home' && !homeCoords ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSortDesc(d => !d)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-button)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-label)',
                    color: 'var(--ink)',
                  }}
                >
                  Order: {sortToggleLabel} ⇄
                </button>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 24,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <span style={{ ...labelStyle, marginBottom: 0, marginRight: 4 }}>Mood</span>
              {moods.map(mood => (
                <button
                  key={mood}
                  type="button"
                  onClick={() => setFilter(mood)}
                  style={chip(filter === mood)}
                >
                  {mood === 'all' ? 'All' : mood}
                </button>
              ))}
            </div>

            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>🐾</div>
                <div
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 18,
                    marginBottom: 8,
                  }}
                >
                  {entries.length === 0
                    ? 'No adventures yet.'
                    : 'No entries match this filter.'}
                </div>
                {entries.length === 0 && (
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                    Connect Strava and run the historical import to populate the journal.
                  </div>
                )}
              </div>
            ) : (
              <JournalEntriesView
                entries={sorted}
                layout={layout}
                selectedId={layout === 'split' ? selectedId : null}
                focusEntryId={selectedId}
                onSelectId={setSelectedId}
              />
            )}
          </>
        )}
      </main>

    </div>
  )
}
