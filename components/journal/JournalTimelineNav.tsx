'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EntryWithStats } from '@/lib/supabase'
import {
  buildTimelineMonths,
  entryLaYmd,
  entryLaYm,
  monthGridCells,
  ymdFromParts,
  type MonthBucket,
} from '@/lib/journalTimeline'
import { getMoodStyle } from '@/lib/mood'

export type TimelineNavVariant = 'panel' | 'sidebar'

type Props = {
  entries: EntryWithStats[]
  selectedId: string | null
  latestId: string | null
  onSelectEntry: (id: string) => void
  variant?: TimelineNavVariant
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function formatDayLabel(ymd: string): string {
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function EntryPickButton({
  entry,
  selected,
  onSelect,
  compact,
}: {
  entry: EntryWithStats
  selected: boolean
  onSelect: () => void
  compact?: boolean
}) {
  const m = getMoodStyle(entry.mood)
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: compact ? '8px 10px' : '10px 12px',
        borderRadius: 'var(--radius-button)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-soft)' : 'var(--bg)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ marginRight: 6 }}>{m.emoji}</span>
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: compact ? 13 : 14,
          fontWeight: 600,
          color: 'var(--ink)',
          lineHeight: 1.25,
        }}
      >
        {entry.title}
      </span>
    </button>
  )
}

function MonthDayTimeline({
  month,
  selectedId,
  activeYmd,
  onSelectEntry,
  compact,
}: {
  month: MonthBucket
  selectedId: string | null
  activeYmd: string | null
  onSelectEntry: (id: string) => void
  compact?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }}>
      {month.days.map(day => {
        const dayActive = activeYmd === day.ymd
        return (
          <div key={day.ymd}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: dayActive ? 'var(--accent)' : 'var(--muted)',
                fontFamily: 'var(--font-label)',
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              {formatDayLabel(day.ymd)}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {day.entries.map(e => (
                <li key={e.id}>
                  <EntryPickButton
                    entry={e}
                    selected={e.id === selectedId}
                    onSelect={() => onSelectEntry(e.id)}
                    compact={compact}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default function JournalTimelineNav({
  entries,
  selectedId,
  latestId,
  onSelectEntry,
  variant = 'panel',
}: Props) {
  const sidebar = variant === 'sidebar'
  const months = useMemo(() => buildTimelineMonths(entries), [entries])
  const [activeYm, setActiveYm] = useState<string | null>(null)
  const [activeYmd, setActiveYmd] = useState<string | null>(null)

  useEffect(() => {
    if (!months.length) {
      setActiveYm(null)
      setActiveYmd(null)
      return
    }
    if (!activeYm || !months.some(m => m.ym === activeYm)) {
      const fromSelection = selectedId
        ? entries.find(e => e.id === selectedId)
        : null
      const ym = fromSelection ? entryLaYm(fromSelection) : months[0].ym
      setActiveYm(ym)
    }
  }, [months, activeYm, selectedId, entries])

  useEffect(() => {
    if (!selectedId) return
    const entry = entries.find(e => e.id === selectedId)
    if (!entry) return
    setActiveYm(entryLaYm(entry))
    setActiveYmd(entryLaYmd(entry))
  }, [selectedId, entries])

  const activeMonth = months.find(m => m.ym === activeYm)
  const dayMap = useMemo(() => {
    const m = new Map<string, MonthBucket['days'][0]>()
    for (const d of activeMonth?.days || []) m.set(d.ymd, d)
    return m
  }, [activeMonth])

  const cells = activeYm ? monthGridCells(activeYm) : []
  const activeDay = activeYmd ? dayMap.get(activeYmd) : undefined

  if (!months.length) return null

  const cellMinH = sidebar ? 28 : 36
  const cellFont = sidebar ? 11 : 12

  return (
    <div aria-label="Adventure history" style={sidebar ? undefined : { marginTop: 32 }}>
      {!sidebar && (
        <h2
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 16,
          }}
        >
          History timeline
        </h2>
      )}

      {sidebar && (
        <p
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 12,
          }}
        >
          Timeline
        </p>
      )}

      {/* Months */}
      <div
        style={
          sidebar
            ? {
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 200,
                overflowY: 'auto',
                marginBottom: 14,
                paddingRight: 4,
              }
            : {
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 8,
                marginBottom: 16,
                scrollbarWidth: 'thin',
              }
        }
      >
        {months.map(m => (
          <button
            key={m.ym}
            type="button"
            onClick={() => {
              setActiveYm(m.ym)
              setActiveYmd(null)
            }}
            style={{
              flexShrink: sidebar ? undefined : 0,
              width: sidebar ? '100%' : undefined,
              padding: sidebar ? '8px 10px' : '10px 14px',
              borderRadius: 'var(--radius-button)',
              border: `1px solid ${activeYm === m.ym ? 'var(--accent)' : 'var(--border)'}`,
              background: activeYm === m.ym ? 'var(--accent-soft)' : sidebar ? 'var(--bg)' : 'var(--bg)',
              cursor: 'pointer',
              fontFamily: 'var(--font-label)',
              textAlign: sidebar ? 'left' : 'center',
              minWidth: sidebar ? undefined : 88,
              display: 'flex',
              justifyContent: sidebar ? 'space-between' : undefined,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: activeYm === m.ym ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              {m.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {m.count}
            </span>
          </button>
        ))}
      </div>

      {activeMonth && activeYm && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: sidebar ? 2 : 4,
              marginBottom: 4,
            }}
          >
            {WEEKDAYS.map((d, i) => (
              <div
                key={`${d}-${i}`}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: sidebar ? 2 : 4,
              marginBottom: sidebar ? 12 : activeDay ? 16 : 0,
            }}
          >
            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} />

              const ymd = ymdFromParts(activeYm, day)
              const bucket = dayMap.get(ymd)
              const count = bucket?.entries.length ?? 0
              const hasWalks = count > 0
              const isSelected = activeYmd === ymd
              const hasLatest = bucket?.entries.some(e => e.id === latestId)

              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={!hasWalks}
                  onClick={() => {
                    setActiveYmd(ymd)
                    if (bucket?.entries.length === 1) {
                      onSelectEntry(bucket.entries[0].id)
                    }
                  }}
                  title={
                    hasWalks
                      ? `${count} walk${count > 1 ? 's' : ''} on ${ymd}`
                      : undefined
                  }
                  style={{
                    aspectRatio: '1',
                    minHeight: cellMinH,
                    borderRadius: sidebar ? 8 : 10,
                    border: `1px solid ${
                      isSelected ? 'var(--accent)' : hasWalks ? 'var(--border)' : 'transparent'
                    }`,
                    background: !hasWalks
                      ? 'transparent'
                      : isSelected
                        ? 'var(--accent-soft)'
                        : 'var(--surface-alt)',
                    cursor: hasWalks ? 'pointer' : 'default',
                    opacity: hasWalks ? 1 : 0.35,
                    fontFamily: 'var(--font-label)',
                    fontSize: cellFont,
                    fontWeight: hasWalks ? 600 : 400,
                    color: hasWalks ? 'var(--ink)' : 'var(--muted)',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  {day}
                  {hasWalks && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 3,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: hasLatest ? 5 : 4,
                        height: hasLatest ? 5 : 4,
                        borderRadius: '50%',
                        background: hasLatest ? 'var(--accent)' : 'var(--muted)',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {sidebar ? (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
                maxHeight: 'min(42vh, 420px)',
                overflowY: 'auto',
              }}
            >
              <MonthDayTimeline
                month={activeMonth}
                selectedId={selectedId}
                activeYmd={activeYmd}
                onSelectEntry={onSelectEntry}
                compact
              />
            </div>
          ) : (
            activeDay &&
            activeDay.entries.length >= 1 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-label)',
                    marginBottom: 10,
                  }}
                >
                  {formatDayLabel(activeDay.ymd)}
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeDay.entries.map(e => (
                    <li key={e.id}>
                      <EntryPickButton
                        entry={e}
                        selected={e.id === selectedId}
                        onSelect={() => onSelectEntry(e.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
