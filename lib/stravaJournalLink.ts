import { getMoodStyle } from './mood'
import { buildJournalEntryDeepLink, isJournalEntryUuid } from './journalDeepLink'
import { updateActivityDescription } from './strava'

/** Marker line — used to replace prior journal links on re-sync. */
export const STRAVA_JOURNAL_DESC_MARKER = "🐺 Chilli's Adventure Journal"

/** Public journal base URL for links written to Strava (never localhost). */
export function getJournalAppBaseUrl(): string {
  const journalPublic = process.env.JOURNAL_PUBLIC_URL?.trim()
  if (journalPublic) return journalPublic.replace(/\/$/, '')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl && !/^https?:\/\/localhost(\b|:)/i.test(appUrl)) {
    return appUrl.replace(/\/$/, '')
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'https://chilli-journal.vercel.app'
}

export function buildJournalEntryUrl(journalEntryId: string): string {
  return buildJournalEntryDeepLink(journalEntryId, getJournalAppBaseUrl())
}

export { isJournalEntryUuid }

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
