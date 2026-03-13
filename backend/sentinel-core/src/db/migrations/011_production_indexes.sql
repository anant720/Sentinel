-- 012_production_indexes.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Production Hardening: Composite & Partial Indices matching real-world loads.

-- 1. Threat Alerts Tracking
-- Alerts are heavily queried by: getAlerts (organization scoping + status filtering)
CREATE INDEX IF NOT EXISTS idx_alerts_org_status 
ON alerts (organization_id, status);

-- 2. Audit Logs
-- Heavy scoping on user_id inside organizations
CREATE INDEX IF NOT EXISTS idx_audit_org_user 
ON audit_logs (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_audit_action_created 
ON audit_logs (action, created_at DESC);

-- 3. Device Lookups
-- Identifying active hardware bound to organizations natively
CREATE INDEX IF NOT EXISTS idx_devices_org_active 
ON devices (organization_id) 
WHERE is_active = true;

-- 4. Auth & Session Lookups
-- Token family checks are queried heavily by family_id and expiration natively
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family 
ON refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expires 
ON refresh_tokens (user_id, expires_at);
