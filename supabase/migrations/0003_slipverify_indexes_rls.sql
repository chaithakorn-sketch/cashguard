-- CashGuard v2 migration 0003
-- Additive: slip verification (Slip2Go) columns, dup/openDraft indexes,
-- new flag kind, and RLS hardening on reference tables.
-- Backend is service-role only, so enabling RLS with no policy simply closes
-- the anon exposure flagged by the advisor without affecting the app.

-- 1) Slip2Go verification result stored on the receipt (per uploaded slip)
alter table cashguard.receipts
  add column if not exists slip_status     text,          -- pass | warning | fail | pending
  add column if not exists slip_ref        text,          -- Slip2Go transRef (bank reference)
  add column if not exists slip_raw        jsonb,         -- full verification payload
  add column if not exists slip_checked_at timestamptz;

-- 2) New flag kind for a slip that Slip2Go rejects (fake / duplicate / expired)
alter type cashguard.flag_kind add value if not exists 'slip_invalid';

-- 3) Indexes: perceptual-hash dup lookup + open-draft lookup
create index if not exists receipts_phash_idx      on cashguard.receipts (phash);
create index if not exists entries_payer_status_idx on cashguard.entries (payer_id, status, type);

-- 4) RLS hardening (advisor rls_disabled). Service role bypasses RLS; anon/authenticated
--    lose direct read/write. The web app reads these through our service-role API.
alter table cashguard.categories      enable row level security;
alter table cashguard.vendor_aliases  enable row level security;
