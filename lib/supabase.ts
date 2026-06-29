import { createClient } from '@supabase/supabase-js';

// Service-role client. Targets the `cashguard` schema by default.
// Service role bypasses RLS — only ever used server-side (API routes / cron).
export const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'cashguard' }, auth: { persistSession: false } }
);
