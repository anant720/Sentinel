-- 022_production_indexes.sql
-- Optimizing Postgres for high-throughput Sentinel ingestion and Intelligence lookups

-- 1. Accelerate Ingestion & Deduplication
-- Index the canonical signature hash to make cryptographic collision checks O(log N)
CREATE INDEX IF NOT EXISTS idx_events_signature ON events(signature);

-- Index the timestamp to optimize sliding window bounding in the database layer (if queried directly)
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- 2. Accelerate Security Engine Worker Queues
-- When detection engines query past context, they often filter by IP or Email
CREATE INDEX IF NOT EXISTS idx_events_payload_ip ON events USING GIN ((payload->'ip'));
CREATE INDEX IF NOT EXISTS idx_events_payload_email ON events USING GIN ((payload->'email'));

-- 3. Accelerate Alert Aggregation & Dashboards
-- The Analyst Dashboard will query alerts by severity and creation time heavily
CREATE INDEX IF NOT EXISTS idx_alerts_severity_time ON alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_org_rule ON alerts(organization_id, rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity);
