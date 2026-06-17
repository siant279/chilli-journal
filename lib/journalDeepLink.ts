const ENTRY_HASH_RE =
  /^#journal-entry-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isJournalEntryUuid(id: string): boolean {
  return UUID_RE.test(id)
}

export function parseJournalEntryIdFromHash(hash: string): string | null {
  const m = hash.match(ENTRY_HASH_RE)
  return m?.[1] ?? null
}

/** Query param + hash so server and client can both resolve the entry. */
export function buildJournalEntryDeepLink(journalEntryId: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/?entry=${journalEntryId}#journal-entry-${journalEntryId}`
}
