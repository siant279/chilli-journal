import type { Metadata } from 'next'
import type { EntryWithStats } from '@/lib/supabase'
import DesignPreviewShell from '@/components/design/DesignPreviewShell'
import {
  getPreviewSampleEntry,
  isUsingPreviewFixture,
  SAMPLE_ENTRY_FIXTURE,
} from '@/lib/designPreviewSample'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Design preview — Chilli Journal',
  description: 'Compare theme options for Chilli\'s Adventure Journal',
  robots: { index: false, follow: false },
}

export default async function DesignPreviewPage() {
  let entry: EntryWithStats = SAMPLE_ENTRY_FIXTURE
  let usingFixture = true

  try {
    entry = await getPreviewSampleEntry()
    usingFixture = isUsingPreviewFixture(entry)
  } catch {
    // keep fixture
  }

  return <DesignPreviewShell entry={entry} usingFixture={usingFixture} />
}
