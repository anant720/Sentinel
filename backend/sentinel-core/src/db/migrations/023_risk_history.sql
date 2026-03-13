-- 023_risk_history.sql
-- Stores time-series snapshots of aggregate risk scores per organization for historical analytics.

CREATE TABLE IF NOT EXISTS risk_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast time-series retrieval
CREATE INDEX IF NOT EXISTS idx_risk_history_org_time ON risk_history(organization_id, timestamp DESC);
