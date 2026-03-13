-- 009_org_detection_settings.sql
-- Implements multi-tenant detection configuration, allowing customized thresholds and enabling/disabling of rules per org.

CREATE TABLE IF NOT EXISTS organization_detection_settings (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_org_detection PRIMARY KEY (organization_id, module_id)
);
