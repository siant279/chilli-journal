import { supabaseAdmin } from './supabase'

export type WebhookIngestStage =
  | 'verification_ok'
  | 'received'
  | 'ignored_event'
  | 'skipped_owner'
  | 'skipped_filter'
  | 'skipped_duplicate_journal'
  | 'success'
  | 'error'

/** Append-only audit trail for Strava → journal ingestion (survives short Vercel log retention). */
export async function logWebhookIngest(params: {
  strava_activity_id?: number | null
  strava_owner_id?: number | null
  stage: WebhookIngestStage
  detail?: string | null
  meta?: Record<string, unknown> | null
  error_message?: string | null
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('webhook_ingest_logs').insert({
      strava_activity_id: params.strava_activity_id ?? null,
      strava_owner_id: params.strava_owner_id ?? null,
      stage: params.stage,
      detail: params.detail ?? null,
      meta: params.meta ?? null,
      error_message: params.error_message ? truncate(params.error_message, 8000) : null,
    })
    if (error) console.error('[webhook_ingest_logs]', error)
  } catch (e) {
    console.error('[webhook_ingest_logs] insert exception:', e)
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}
