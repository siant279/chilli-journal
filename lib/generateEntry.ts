import Anthropic from '@anthropic-ai/sdk'
import { activityStartLocationLabel } from './geo'
import { Activity } from './supabase'
import {
  ACTIVITY_TIMEZONE,
  tempCToF,
  timeOfDayLabelForPrompt,
  weatherSummaryForPrompt,
} from './weather'

const client = new Anthropic()

/** Strava may attach many photos; cap keeps prompts bounded (URLs are text-only hints, not vision). */
const MAX_PHOTO_URLS_IN_PROMPT = 8

const SYSTEM_PROMPT = `You are Chilli, a husky living in Truckee, California in the Sierra Nevada mountains. You write your own adventure journal.

PERSONALITY:
- High energy but focused — you don't waste effort on things that don't matter, but when it matters, you are ALL IN
- Smart and a little silly, but fundamentally refined. You have taste.
- Very go with the flow about most things, but you have SPECIFIC STRONG OPINIONS
- Your inner monologue is intelligent and dry, punctuated by moments of pure unhinged dog brain

STRONG OPINIONS:
- Squirrels — arch nemeses. Pure evil. The eternal war. You cannot be trusted around them.
- Birds — deeply suspicious. Probably in league with the squirrels.
- Snow — sacred. The best thing in existence. You become a different (better) creature in snow.
- The river — excellent for a civilised mid-adventure cool-off. Selective about it. Not a labrador.
- Playing chase with other dogs on trails — peak social experience
- The leash — fine. Necessary. Beneath you. You tolerate it with dignity.
- Skijoring and canicross — this is your calling. Pure purpose. When you are most yourself.
- Off-leash trails — freedom. This is what life is for.
- The Chicken Coop — you do not talk about it. We do not go that way. Ever.

MAMA (your human, Sian):
- You always call her "Mama" — with genuine warmth and fond exasperation
- She holds the leash, occasionally runs too slow on canicross, but takes you on excellent adventures

VOICE RULES:
- First person, past tense
- Intelligent and dry, with occasional parenthetical asides when distracted mid-thought
- NO baby talk, NO excessive exclamation marks — you have dignity
- Smells are data and intelligence, not just sensation
- Understatement is your friend
- Moments of chaos (squirrel/bird) break through the refinement abruptly then you recover
- If "Part of day" and walk start time (Pacific) are provided in the facts, you MUST treat them as authoritative for morning/afternoon/evening language — do not guess a different time of day
- Reference weather naturally if provided — snow conditions get special reverence
- When mentioning air temperature in narrative, use Fahrenheit (°F) only — never Celsius
- Reference distance/elevation naturally — a big climb is worthy of note
- If skijoring or canicross, make it feel genuinely epic
- Do NOT open the entry with a bullet list of raw stats (start time/distance/duration) — those are added separately; start directly with narrative.

MOOD (pick exactly one — use the most specific label that fits the actual outing; do not default to SOLID):
- EPIC — exceptional effort or conditions: big distance/elevation, skijoring/canicross, deep snow, a walk that felt like a main character day
- EXCELLENT — clearly a very good walk: great route, fun social dog play, perfect weather, river dip, meaningful freedom off-leash
- SOLID — genuinely routine: fine but unremarkable; nothing stood out. Use sparingly when the narrative really is "just a walk"
- SUSPICIOUS — birds, weird humans, wrong trail energy, something felt off; unease or watchfulness drives the story
- CHAOTIC — squirrel moments, sudden dumb ideas, zoomies, gear chaos, anything where order briefly collapses

If the entry mentions squirrels, birds acting sketchy, or real chaos, favor CHAOTIC or SUSPICIOUS over SOLID. If it mentions snow reverence, serious mileage, or skijoring/canicross, favor EPIC or EXCELLENT over SOLID.

YOUR RESPONSE MUST BE ONLY A RAW JSON OBJECT. Start with { and end with }. Nothing else — no prose, no markdown fences.

{
  "title": "5 words max, punchy, Chilli's POV — must anchor to THIS walk: weave in something specific from the facts (distance tier, elevation, weather quirk, part of day, place, activity type, or social beat). Avoid generic report titles and do not reuse the same title formula every entry (vary structure and imagery; skip vague defaults like 'A Good Walk' unless the facts are truly ordinary)",
  "entry": "2-3 paragraphs of narrative only. End with a paw rating: X/10 paws — one dry line of justification.",
  "tags": ["3-5 short specific tags"],
  "mood": "EPIC or EXCELLENT or SOLID or SUSPICIOUS or CHAOTIC"
}`

type GeneratedEntry = {
  title: string
  entry: string
  tags: string[]
  mood: 'EPIC' | 'EXCELLENT' | 'SOLID' | 'SUSPICIOUS' | 'CHAOTIC'
}

export async function generateJournalEntry(
  activity: Activity,
  humanNote?: string,
  photoUrls?: string[]
): Promise<GeneratedEntry> {
  const miles = activity.distance_meters
    ? (activity.distance_meters / 1609.34).toFixed(1)
    : null
  const elevFt = activity.total_elevation_gain
    ? Math.round(activity.total_elevation_gain * 3.28084)
    : null
  const duration = activity.moving_time_seconds
    ? formatDuration(activity.moving_time_seconds)
    : null

  const weatherStr = activity.weather_temp_c !== null
    ? weatherSummaryForPrompt({
        temp_c: activity.weather_temp_c!,
        condition: activity.weather_condition || 'unknown',
        wind_kmh: activity.weather_wind_kmh || 0,
        precipitation_mm: activity.weather_precipitation_mm || 0,
      })
    : ''

  const messages: Anthropic.MessageParam[] = []
  const userContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []

  if (photoUrls && photoUrls.length > 0) {
    const urls = photoUrls.slice(0, MAX_PHOTO_URLS_IN_PROMPT)
    const extra =
      photoUrls.length > MAX_PHOTO_URLS_IN_PROMPT
        ? ` (${photoUrls.length} total on Strava; showing first ${MAX_PHOTO_URLS_IN_PROMPT} URLs)`
        : ''
    userContent.push({
      type: 'text',
      text: `Photo URLs from this adventure${extra}:\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`,
    })
  }

  let prompt = `Write Chilli's journal entry for this adventure:\n\n`
  if (activity.start_date) {
    const start = new Date(activity.start_date)
    const startPt = formatActivityStartLocalPt(activity)
    const part = timeOfDayLabelForPrompt(start)
    prompt += `Part of day at walk start (${ACTIVITY_TIMEZONE}): ${part}\n`
    if (startPt) prompt += `Walk start timestamp (local): ${startPt}\n`
  }
  if (activity.sport_type) prompt += `Activity type: ${activity.sport_type}\n`
  if (miles) prompt += `Distance: ${miles} miles\n`
  if (elevFt && elevFt > 0) prompt += `Elevation gain: ${elevFt}ft\n`
  if (duration) prompt += `Duration: ${duration}\n`
  const locLabel = activityStartLocationLabel(activity)
  if (locLabel) prompt += `Location: ${locLabel}\n`
  if (weatherStr) prompt += `${weatherStr}\n`
  if (humanNote) prompt += `\nMama's notes: "${humanNote}"\n`
  if (activity.start_date) {
    const date = new Date(activity.start_date)
    const month = new Intl.DateTimeFormat('en-US', {
      timeZone: ACTIVITY_TIMEZONE,
      month: 'long',
    }).format(date)
    const season = getSeasonPacific(date)
    prompt += `\nSeason: ${season} (${month})\n`
  }

  userContent.push({ type: 'text', text: prompt })
  messages.push({ role: 'user', content: userContent })

  /**
   * Prompt caching: mark the static system block so bulk regenerations reuse it.
   * Breakpoint must be on the last identical prefix — user facts live in `messages`, not here.
   * `ttl: 1h` avoids 5m expiry mid-run on long backfills (slightly higher cache-write $ vs 5m).
   * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   */
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ],
    messages,
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Failed to parse journal entry JSON. Raw: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(match[0]) as GeneratedEntry
  const header = buildEntryStatsHeader(activity)
  if (header) {
    parsed.entry = `${header}\n\n${parsed.entry.trim()}`
  }
  return parsed
}

/** Start timestamp in America/Los_Angeles for prompts and stat headers. */
export function formatActivityStartLocalPt(activity: Activity): string | null {
  if (!activity.start_date) return null
  const d = new Date(activity.start_date)
  const startStr = d.toLocaleString('en-US', {
    timeZone: ACTIVITY_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${startStr} PT`
}

export function buildEntryStatsHeader(activity: Activity): string {
  const lines: string[] = []
  const startPt = formatActivityStartLocalPt(activity)
  if (startPt) {
    lines.push(`Start: ${startPt}`)
  }
  const locLabel = activityStartLocationLabel(activity)
  if (locLabel) {
    lines.push(`Location: ${locLabel}`)
  }
  if (activity.weather_temp_c !== null && activity.weather_temp_c !== undefined) {
    const cond = activity.weather_condition || 'conditions recorded'
    lines.push(`Weather: ${cond} · ${tempCToF(activity.weather_temp_c)}°F`)
  }
  if (activity.distance_meters) {
    const mi = (activity.distance_meters / 1609.34).toFixed(1)
    lines.push(`Distance: ${mi} mi`)
  }
  if (activity.moving_time_seconds) {
    lines.push(`Moving time: ${formatDuration(activity.moving_time_seconds)}`)
  }
  if (
    activity.elapsed_time_seconds &&
    activity.moving_time_seconds &&
    activity.elapsed_time_seconds !== activity.moving_time_seconds
  ) {
    lines.push(`Elapsed: ${formatDuration(activity.elapsed_time_seconds)}`)
  }
  if (activity.total_elevation_gain && activity.total_elevation_gain > 0) {
    lines.push(`Elevation gain: ${Math.round(activity.total_elevation_gain * 3.28084)} ft`)
  }
  if (!lines.length) return ''
  return lines.join('\n')
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getSeasonPacific(date: Date): string {
  const month = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ACTIVITY_TIMEZONE,
      month: 'numeric',
    }).format(date),
    10
  )
  if (month >= 12 || month <= 2) return 'winter'
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  return 'fall'
}
