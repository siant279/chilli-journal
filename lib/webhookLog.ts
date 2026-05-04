import { supabaseAdmin } from './supabase'

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/** Supabase/PostgREST can surface transient network failures as fetch timeouts between edge and DB. */
function isRetryableLogError(e: unknown): boolean {
  const msg =
    typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string'
      ? (e as { message: string }).message
      : e instanceof Error
        ? `${e.message}${(e as Error & { cause?: unknown }).cause ? String((e as Error & { cause?: unknown }).cause) : ''}`
        : String(e)
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket|network|timed out/i.test(msg)
}

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
  const row = {
    strava_activity_id: params.strava_activity_id ?? null,
    strava_owner_id: params.strava_owner_id ?? null,
    stage: params.stage,
    detail: params.detail ?? null,
    meta: params.meta ?? null,
    error_message: params.error_message ? truncate(params.error_message, 8000) : null,
  }
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { error } = await supabaseAdmin.from('webhook_ingest_logs').insert(row)
      if (!error) return
      if (attempt < maxAttempts - 1 && isRetryableLogError(error)) {
        await sleep(200 * (attempt + 1))
        continue
      }
      console.error('[webhook_ingest_logs]', error)
      return
    } catch (e) {
      if (attempt < maxAttempts - 1 && isRetryableLogError(e)) {
        await sleep(200 * (attempt + 1))
        continue
      }
      console.error('[webhook_ingest_logs] insert exception:', e)
      return
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}
