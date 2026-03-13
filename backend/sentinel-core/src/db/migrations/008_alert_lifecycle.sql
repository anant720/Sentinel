-- 008_alert_lifecycle.sql

-- 1. Standardize existing statuses to uppercase and map legacy values
UPDATE alerts SET status = UPPER(status);
UPDATE alerts SET status = 'ACKNOWLEDGED' WHERE status = 'INVESTIGATING';
UPDATE alerts SET status = 'DISMISSED' WHERE status = 'FALSE_POSITIVE';

-- 2. Alter column type and default
ALTER TABLE alerts 
ALTER COLUMN status TYPE TEXT,
ALTER COLUMN status SET DEFAULT 'OPEN';

-- 3. Add new workflow columns idempotently
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolution_note TEXT,
ADD COLUMN IF NOT EXISTS suppression_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS impact TEXT,
ADD COLUMN IF NOT EXISTS recommended_action TEXT;

-- 4. Satisfy NOT NULL constraints for existing records
UPDATE alerts SET title = 'Migrated Alert', description = 'Legacy alert record.' WHERE title IS NULL;

ALTER TABLE alerts
ALTER COLUMN title SET NOT NULL,
ALTER COLUMN description SET NOT NULL;

-- 5. Enforce strict state machine constraints
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS chk_alert_status;
ALTER TABLE alerts
ADD CONSTRAINT chk_alert_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'));
