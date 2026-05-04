/**
 * List activities stored for a calendar day in America/Los_Angeles and journal coverage.
 *   npx ts-node --project tsconfig.scripts.json scripts/diagDayActivities.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/diagDayActivities.ts --date 2026-05-04
 *
 * Day bounds: that date 00:00–24:00 in LA, converted to UTC (handles DST via lookup).
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { isChilliActivity } from '../lib/strava'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Returns UTC ISO range [start, end) for the LA calendar day `ymd` (YYYY-MM-DD).
 * Uses the fact that representing "local midnight" as UTC requires knowing offset; we binary-search
 * the UTC instant that formats as 00:00 that day in LA (stable for our use).
 */
function laDayBoundsUtc(ymd: string): { start: string; end: string } {
  const [y, mo, d] = ymd.split('-').map(Number)
  if (!y || !mo || !d) throw new Error(`Use --date YYYY-MM-DD`)

  const target = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0)
  let hi = Date.UTC(y, mo - 1, d + 1, 0, 0, 0)
  let startMs = lo
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const la = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(mid))
    if (la < target) lo = mid + 1
    else hi = mid
  }
  startMs = lo
  const start = new Date(startMs)
  const end = new Date(startMs + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function parseArgs(): string {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') return argv[++i] || ''
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function main() {
  const dateArg = parseArgs()
  const { start, end } = laDayBoundsUtc(dateArg)

  console.log(`America/Los_Angeles day ${dateArg}`)
  console.log(`UTC range [start, end): ${start} .. ${end}\n`)

  const { data: rows, error } = await supabaseAdmin
    .from('activities')
    .select('id, strava_id, name, start_date')
    .gte('start_date', start)
    .lt('start_date', end)
    .order('start_date', { ascending: true })

  if (error) throw error

  const list = rows || []
  console.log(`activities rows for this local day: ${list.length}\n`)

  for (const r of list) {
    const { data: je } = await supabaseAdmin
      .from('journal_entries')
      .select('id, title')
      .eq('activity_id', r.id)
      .maybeSingle()

    const chilli = isChilliActivity(r.name)
    console.log(`— ${r.start_date}`)
    console.log(`  strava_id=${r.strava_id}  activity pk=${r.id}`)
    console.log(`  name: ${r.name}`)
    console.log(`  Chilli/Fi title filter: ${chilli}`)
    console.log(`  journal: ${je ? `yes — "${je.title}"` : 'MISSING'}\n`)
  }

  if (list.length < 2) {
    console.log('--- Last 12 activities (any date), newest first:\n')
    const { data: recent } = await supabaseAdmin
      .from('activities')
      .select('id, strava_id, name, start_date')
      .order('start_date', { ascending: false })
      .limit(12)
    for (const r of recent || []) {
      console.log(`  ${r.start_date}  |  ${r.name}`)
    }
    console.log('')
  }

  if (list.length === 0) {
    console.log(
      'No activities in Supabase for that local calendar day. Strava may still show two walks — check import/webhook, or whether one walk uses a non-matching title.',
    )
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
