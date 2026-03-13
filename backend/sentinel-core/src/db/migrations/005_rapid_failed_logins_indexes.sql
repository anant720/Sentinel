-- Migration 005: Rapid Failed Logins Detection Indexes
-- Adds specialized indexes to support the time-window aggregation queries safely and efficiently.

-- 1. Optimize the time-window cross-event aggregation query
-- We use expression index `payload->>'email'` because user_id does not exist directly on the events table.
CREATE INDEX IF NOT EXISTS idx_events_org_type_email_created_desc
ON events (
    organization_id, 
    event_type, 
    (payload->>'email'), 
    created_at DESC
);

-- 2. Optimize the suppression query (checking if alert recently triggered for this user)
-- Uses metadata->>'userId' extraction as required by the suppression pattern.
CREATE INDEX IF NOT EXISTS idx_alerts_org_type_created_desc
ON alerts (
    organization_id, 
    type, 
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_alerts_metadata_email
ON alerts ((metadata->>'email'));
