-- Migration 013: Tenant Isolation Hardening
-- Enforces physical boundaries at the database level for all entities.

ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE devices ALTER COLUMN organization_id SET NOT NULL;

-- Indexing to support dashboard filtering by Org
CREATE INDEX IF NOT EXISTS idx_alerts_org_created_at ON alerts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_org_severity ON alerts (organization_id, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_org_status ON alerts (organization_id, status);
