import { createClient } from '@supabase/supabase-js';

// Service-role client targeting the `cashguard` schema. Server-side only.
// Fallbacks keep `next build` from throwing at import time when env is absent;
// real values are injected at runtime on Vercel.
export const sb = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'build-placeholder',
  { db: { schema: 'cashguard' }, auth: { persistSession: false } }
);

/**
 * Unwrap a Supabase result, surfacing errors LOUDLY instead of swallowing them.
 * supabase-js never throws — it returns { data, error }. Destructuring only `data`
 * (the old pattern here) turned every DB failure into a silent no-op (e.g. the
 * webhook replying HTTP 200 while writing nothing). Use this on critical reads/writes
 * so failures hit the webhook's per-event try/catch and show up in Vercel logs.
 */
export function unwrap<T>(res: { data: T; error: { message?: string } | null }, ctx: string): T {
  if (res.error) {
    console.error(`[supabase] ${ctx} failed:`, res.error.message ?? res.error);
    throw new Error(`supabase ${ctx}: ${res.error.message ?? 'unknown error'}`);
  }
  return res.data;
}
