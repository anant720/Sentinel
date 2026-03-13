-- 018_alert_indexes.sql
-- Track 3.3: Composite indexes on alerts table for fast org-scoped queries.
-- These are crucial for the dashboard's alert list, filter, and sort performance.

-- Fast lookup by org + status (Used by UI filters)
CREATE INDEX IF NOT EXISTS idx_alerts_org_status
    ON alerts (organization_id, status);

-- Fast lookup by org + severity (Used by severity filter)
CREATE INDEX IF NOT EXISTS idx_alerts_org_severity
    ON alerts (organization_id, severity);

-- Fast chronological listing per org (Used by default sort)
CREATE INDEX IF NOT EXISTS idx_alerts_org_created_desc
    ON alerts (organization_id, created_at DESC);

-- Fingerprint lookup (Used for alert deduplication in detection engine)
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint
    ON alerts (fingerprint) WHERE fingerprint IS NOT NULL;

-- Composite for unresolved alerts (partial index — very small, very fast)
CREATE INDEX IF NOT EXISTS idx_alerts_open_by_org
    ON alerts (organization_id, created_at DESC)
    WHERE status = 'open';
