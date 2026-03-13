-- 007_refresh_token_families.sql
-- Enables strict Refresh Token Rotation (RTR) to definitively drop concurrent replay attacks.

-- A family represents a chain of rotated tokens originating from a single primary login event.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID DEFAULT uuid_generate_v4();

-- Once a token is consumed to generate a child token, we must easily query the family to purge it out if reuse occurs
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
