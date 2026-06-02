export type JournalLayoutMode = 'split' | 'paginated'

export const JOURNAL_LAYOUTS: {
  id: JournalLayoutMode
  label: string
  short: string
  description: string
}[] = [
  {
    id: 'split',
    label: 'Timeline',
    short: 'Timeline',
    description: 'Calendar timeline on the left, full entry on the right',
  },
  {
    id: 'paginated',
    label: 'Pages',
    short: 'Pages',
    description: 'Browse entries in pages — use sort to reorder',
  },
]

export const LAYOUT_STORAGE_KEY = 'chilli-journal-layout'
export const ENTRIES_PER_PAGE = 6

const LEGACY_SPLIT_ALIASES = new Set([
  'split',
  'timeline',
  'reader',
  'grid',
  'scroll',
])

/** Resolve stored layout values (including retired modes) to a supported mode. */
export function normalizeLayoutMode(stored: string | null): JournalLayoutMode {
  if (stored === 'paginated') return 'paginated'
  if (stored && LEGACY_SPLIT_ALIASES.has(stored)) return 'split'
  return 'split'
}

export function isJournalLayoutMode(v: string): v is JournalLayoutMode {
  return v === 'split' || v === 'paginated'
}
