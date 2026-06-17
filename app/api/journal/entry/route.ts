import { NextResponse } from 'next/server'
import { isJournalEntryUuid } from '@/lib/journalDeepLink'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !isJournalEntryUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('entries_with_stats')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
