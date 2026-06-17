import { getMoodStyle } from './mood'
import { updateActivityDescription } from './strava'

/** Marker line — used to replace prior journal links on re-sync. */
export const STRAVA_JOURNAL_DESC_MARKER = "🐺 Chilli's Adventure Journal"

export function getJournalAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

export function buildJournalEntryUrl(journalEntryId: string): string {
  return `${getJournalAppBaseUrl()}/#journal-entry-${journalEntryId}`
}

export function buildStravaJournalDescriptionBlock(
  title: string,
  mood: string,
  journalEntryId: string,
): string {
  const moodStyle = getMoodStyle(mood)
  const url = buildJournalEntryUrl(journalEntryId)
  return [
    STRAVA_JOURNAL_DESC_MARKER,
    `${moodStyle.emoji} 📖 "${title}" · ${moodStyle.label}`,
    url,
  ].join('\n')
}

/** Keep any existing Strava description; replace a prior journal block if present. */
export function mergeStravaDescription(
  existing: string | null | undefined,
  journalBlock: string,
): string {
  const base = (existing || '').trim()
  const markerIdx = base.indexOf(STRAVA_JOURNAL_DESC_MARKER)
  const kept = markerIdx >= 0 ? base.slice(0, markerIdx).trim() : base
  return kept ? `${kept}\n\n${journalBlock}` : journalBlock
}

export type SyncJournalLinkResult =
  | { ok: true }
  | { ok: false; skipped?: boolean; error: string }

/** Best-effort: append journal title + link to the Strava activity description. */
export async function syncJournalLinkToStrava(params: {
  accessToken: string
  activityId: number
  journalEntryId: string
  title: string
  mood: string
  existingDescription?: string | null
}): Promise<SyncJournalLinkResult> {
  const block = buildStravaJournalDescriptionBlock(
    params.title,
    params.mood,
    params.journalEntryId,
  )
  const description = mergeStravaDescription(params.existingDescription, block)

  try {
    await updateActivityDescription(params.accessToken, params.activityId, description)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/403|401/.test(msg)) {
      return {
        ok: false,
        skipped: true,
        error:
          'Strava token lacks activity:write — reconnect Strava in the app to enable journal links on activities',
      }
    }
    return { ok: false, error: msg }
  }
}
