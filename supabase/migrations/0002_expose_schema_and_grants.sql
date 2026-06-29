-- Applied to Supabase project uwniugxetyikjzkobifp on 2026-06-30.
-- Fixes the P0 where the LINE webhook returned HTTP 200 but wrote nothing and
-- never replied: the `cashguard` schema (not `public`) was never exposed to
-- PostgREST and the API roles had no privileges on it, so every supabase-js
-- call returned 406 PGRST106 — silently, because the code ignored `error`.
--
-- NOTE: custom (non-public) schemas need BOTH of the below; Supabase only
-- auto-grants/auto-exposes the `public` schema.

-- 1) Privileges so the PostgREST roles can reach cashguard.*
grant usage on schema cashguard to anon, authenticated, service_role;

-- service_role (LINE webhook; bypasses RLS) gets full access
grant all on all tables    in schema cashguard to service_role;
grant all on all sequences in schema cashguard to service_role;
grant all on all functions in schema cashguard to service_role;

-- authenticated: table DML allowed, RLS still governs row visibility
grant select, insert, update, delete on all tables in schema cashguard to authenticated;
grant usage, select on all sequences in schema cashguard to authenticated;
grant execute on all functions in schema cashguard to authenticated;

-- anon: read-only on the non-sensitive reference tables (RLS off there)
grant select on cashguard.categories     to anon;
grant select on cashguard.vendor_aliases to anon;

-- 2) Default privileges so future objects inherit grants
alter default privileges in schema cashguard grant all on tables    to service_role;
alter default privileges in schema cashguard grant all on sequences to service_role;
alter default privileges in schema cashguard grant all on functions to service_role;
alter default privileges in schema cashguard grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema cashguard grant usage, select on sequences to authenticated;

-- 3) Expose the cashguard schema to PostgREST (db-config=on => in-DB wins)
--    Also set it in Dashboard > Settings > API > Exposed schemas for durability.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, cashguard';

-- 4) Reload PostgREST config + schema cache
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
