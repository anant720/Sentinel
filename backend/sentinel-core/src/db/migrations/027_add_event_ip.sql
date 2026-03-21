-- Migration 027: Add ip_address to events
-- This column will store the server-verified client IP, bypassing client-side payload spoofing.

ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

-- Index for efficient querying by IP
CREATE INDEX IF NOT EXISTS idx_events_ip_address ON events (organization_id, ip_address, created_at DESC)
    WHERE ip_address IS NOT NULL;
