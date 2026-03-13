-- 010_device_revocation.sql
-- Adds the ability to administratively severe compromised endpoints, terminating future event ingestion payload verifications immediately.

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;
