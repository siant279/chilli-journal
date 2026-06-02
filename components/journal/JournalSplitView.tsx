'use client'

import { useMemo } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import { newestEntry } from '@/lib/journalTimeline'
import EntryCard from '../EntryCard'
import JournalTimelineNav from './JournalTimelineNav'

type Props = {
  entries: EntryWithStats[]
  selectedId: string | null
  onSelectId: (id: string) => void
}

export default function JournalSplitView({ entries, selectedId, onSelectId }: Props) {
  const latest = useMemo(() => newestEntry(entries), [entries])

  const selectedEntry = useMemo(() => {
    if (!entries.length) return null
    if (selectedId) {
      const found = entries.find(e => e.id === selectedId)
      if (found) return found
    }
    return latest
  }, [entries, selectedId, latest])

  if (!selectedEntry) return null

  const showingLatest = latest && selectedEntry.id === latest.id

  return (
    <div
      className="journal-split"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 320px) 1fr',
        gap: 20,
        alignItems: 'start',
      }}
    >
      <aside
        className="journal-split-list"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '14px 12px',
          maxHeight: 'min(85vh, 920px)',
          overflowY: 'auto',
          position: 'sticky',
          top: 16,
        }}
      >
        <JournalTimelineNav
          entries={entries}
          selectedId={selectedId}
          latestId={latest?.id ?? null}
          onSelectEntry={onSelectId}
          variant="sidebar"
        />
      </aside>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            {showingLatest ? 'Latest dispatch' : 'Reading'}
          </h2>
          {!showingLatest && latest && (
            <button
              type="button"
              onClick={() => onSelectId(latest.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--accent)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-label)',
              }}
            >
              Jump to latest
            </button>
          )}
        </div>
        <EntryCard entry={selectedEntry} />
      </div>
    </div>
  )
}
