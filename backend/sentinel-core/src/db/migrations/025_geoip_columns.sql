-- Migration 025: GeoIP Enrichment Columns
-- Adds geographic metadata columns to the events table.
-- All columns are nullable for backward compatibility with existing events.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS geo_country TEXT,
    ADD COLUMN IF NOT EXISTS geo_country_code TEXT,
    ADD COLUMN IF NOT EXISTS geo_city TEXT,
    ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_lon DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_isp TEXT;

-- Index for efficient geographic filtering on the dashboard
CREATE INDEX IF NOT EXISTS idx_events_geo_country ON events (organization_id, geo_country, created_at DESC)
    WHERE geo_country IS NOT NULL;
