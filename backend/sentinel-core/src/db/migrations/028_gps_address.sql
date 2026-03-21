-- Migration 028: GPS Address Column
-- Adds a dedicated column for high-fidelity human-readable locations (Reverse Geocoding).

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS geo_address TEXT;

-- Index for efficient location search
CREATE INDEX IF NOT EXISTS idx_events_geo_address ON events (organization_id, geo_address)
    WHERE geo_address IS NOT NULL;
