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
import { laDayBoundsUtc, laTodayYmd } from '../lib/laCalendar'
import { isChilliActivity } from '../lib/strava'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseArgs(): string {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') return argv[++i] || ''
  }
  return laTodayYmd()
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
