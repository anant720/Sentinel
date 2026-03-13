-- 016_org_event_quota.sql
-- Adds monthly_event_quota to api_keys for per-org event caps (Track 1.2)
-- and a plan-tier field to organizations for future billing tier support.

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS monthly_event_quota INTEGER DEFAULT 0;
-- 0 = unlimited. > 0 = monthly hard cap enforced via Redis.

COMMENT ON COLUMN api_keys.monthly_event_quota IS
    'Monthly event ingestion cap for this API key. 0 = unlimited.';
