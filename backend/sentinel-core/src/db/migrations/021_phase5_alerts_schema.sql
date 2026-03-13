-- 021_phase5_alerts_schema.sql
-- Add Phase 5 Detection Engine mappings structurally

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS rule_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS entity VARCHAR(255),
    ADD COLUMN IF NOT EXISTS evidence JSONB;

-- Note: created_at and severity are already indexed natively via 018_alert_indexes.sql.
-- Enforcing the strict entity correlation indexing here.
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity);
