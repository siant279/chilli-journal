'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import type { JournalLayoutMode } from '@/lib/journalLayouts'
import { ENTRIES_PER_PAGE } from '@/lib/journalLayouts'
import EntryCard from '../EntryCard'
import JournalSplitView from './JournalSplitView'

type Props = {
  entries: EntryWithStats[]
  layout: JournalLayoutMode
  selectedId: string | null
  onSelectId: (id: string) => void
}

function PaginationBar({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 28,
        fontFamily: 'var(--font-label)',
        fontSize: 13,
      }}
      aria-label="Journal pagination"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={navBtnStyle(page <= 1)}
      >
        ← Prev
      </button>
      <span style={{ color: 'var(--muted)', padding: '0 8px' }}>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        style={navBtnStyle(page >= totalPages)}
      >
        Next →
      </button>
    </nav>
  )
}

function navBtnStyle(disabled: boolean): CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-button)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: disabled ? 'var(--muted)' : 'var(--ink)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontWeight: 600,
    fontFamily: 'var(--font-label)',
  }
}

export default function JournalEntriesView({
  entries,
  layout,
  selectedId,
  onSelectId,
}: Props) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [entries.length, layout])

  const totalPages = Math.max(1, Math.ceil(entries.length / ENTRIES_PER_PAGE))
  const pageEntries = useMemo(() => {
    const start = (page - 1) * ENTRIES_PER_PAGE
    return entries.slice(start, start + ENTRIES_PER_PAGE)
  }, [entries, page])

  if (entries.length === 0) return null

  if (layout === 'split') {
    return (
      <JournalSplitView
        entries={entries}
        selectedId={selectedId}
        onSelectId={onSelectId}
      />
    )
  }

  return (
    <>
      {pageEntries.map(entry => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
      <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />
    </>
  )
}
