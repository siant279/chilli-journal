import type { EntryWithStats } from './supabase'

const LA: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}

/** YYYY-MM-DD in America/Los_Angeles for a walk start time. */
export function entryLaYmd(entry: EntryWithStats): string {
  return new Intl.DateTimeFormat('en-CA', LA).format(new Date(entry.start_date))
}

/** YYYY-MM in America/Los_Angeles. */
export function entryLaYm(entry: EntryWithStats): string {
  return entryLaYmd(entry).slice(0, 7)
}

export function newestEntry(entries: EntryWithStats[]): EntryWithStats | null {
  if (!entries.length) return null
  return [...entries].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
  )[0]
}

export type DayBucket = { ymd: string; entries: EntryWithStats[] }

export type MonthBucket = {
  ym: string
  label: string
  count: number
  days: DayBucket[]
}

/** Group filtered entries into months (newest first), then days (newest first). */
export function buildTimelineMonths(entries: EntryWithStats[]): MonthBucket[] {
  const byDay = new Map<string, EntryWithStats[]>()
  for (const e of entries) {
    const ymd = entryLaYmd(e)
    const list = byDay.get(ymd) || []
    list.push(e)
    byDay.set(ymd, list)
  }

  const byMonth = new Map<string, DayBucket[]>()
  for (const [ymd, dayEntries] of Array.from(byDay.entries())) {
    const ym = ymd.slice(0, 7)
    const sortedDay = [...dayEntries].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    )
    const days = byMonth.get(ym) || []
    days.push({ ymd, entries: sortedDay })
    byMonth.set(ym, days)
  }

  const months: MonthBucket[] = []
  for (const [ym, days] of Array.from(byMonth.entries())) {
    days.sort((a, b) => b.ymd.localeCompare(a.ymd))
    const [y, mo] = ym.split('-').map(Number)
    const label = new Date(y, mo - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    months.push({
      ym,
      label,
      count: days.reduce((s, d) => s + d.entries.length, 0),
      days,
    })
  }

  months.sort((a, b) => b.ym.localeCompare(a.ym))
  return months
}

/** Calendar cells for a month: null = padding, number = day of month. */
export function monthGridCells(ym: string): (number | null)[] {
  const [y, mo] = ym.split('-').map(Number)
  const firstDow = new Date(y, mo - 1, 1).getDay()
  const daysInMonth = new Date(y, mo, 0).getDate()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function ymdFromParts(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`
}
