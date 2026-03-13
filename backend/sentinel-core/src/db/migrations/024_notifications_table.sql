-- 024_notifications_table.sql

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by organization
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);
-- Index for finding the notification associated with an alert
CREATE INDEX IF NOT EXISTS idx_notifications_alert ON notifications(alert_id);
