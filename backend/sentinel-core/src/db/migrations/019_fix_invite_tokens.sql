-- 019_fix_invite_tokens.sql
-- Replaces the table-level unique constraint with a partial index 
-- to allow multiple expired/used invites but only one active invite per email/org.

-- Drop the restrictive table constraint created in 015
ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS unique_active_invite;

-- Recreate the explicit partial index if it was lost or not strictly enforced
-- Using DROP IF EXISTS ensures idempotency
DROP INDEX IF EXISTS idx_invite_tokens_active;
CREATE UNIQUE INDEX idx_invite_tokens_active ON invite_tokens(email, organization_id) WHERE is_used = false;
