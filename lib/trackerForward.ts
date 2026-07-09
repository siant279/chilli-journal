import { fetchActivity, getValidAccessToken, isChilliActivity } from './strava'

const TRACKER_INGEST_URL = process.env.TRACKER_INGEST_URL
const TRACKER_INGEST_SECRET = process.env.TRACKER_INGEST_SECRET

export function isJournalActivity(sportType: string | undefined, name: string): boolean {
  if (sportType === 'Walk') return true
  return isChilliActivity(name)
}

export async function forwardActivityToTracker(
  activityId: number,
  aspect: 'create' | 'update' | 'delete',
) {
  if (!TRACKER_INGEST_URL || !TRACKER_INGEST_SECRET) {
    console.warn('Tracker ingest not configured — skipping forward')
    return
  }

  let activity: Record<string, unknown> | null = null
  if (aspect !== 'delete') {
    const accessToken = await getValidAccessToken()
    const fetched = await fetchActivity(accessToken, activityId)
    const sportType = (fetched.sport_type || fetched.type) as string | undefined
    const name = (fetched.name as string) || ''
    if (isJournalActivity(sportType, name)) return
    activity = fetched as Record<string, unknown>
  }

  const resp = await fetch(TRACKER_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tracker-ingest-secret': TRACKER_INGEST_SECRET,
    },
    body: JSON.stringify({ aspect_type: aspect, activity: activity ?? { id: activityId } }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Tracker ingest failed: ${resp.status} ${text.slice(0, 200)}`)
  }
}
