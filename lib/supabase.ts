import { createClient } from '@supabase/supabase-js';

// Service-role client targeting the `cashguard` schema. Server-side only.
// Fallbacks keep `next build` from throwing at import time when env is absent;
// real values are injected at runtime on Vercel.
export const sb = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'build-placeholder',
  { db: { schema: 'cashguard' }, auth: { persistSession: false } }
);
