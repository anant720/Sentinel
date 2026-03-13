-- Migration 003: Add processed_at to events table
-- Tracks when the worker completed lifecycle processing.
-- processed_at = NULL means event is pending worker pickup.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;

-- Index to efficiently find unprocessed events (useful for backfill, monitoring)
CREATE INDEX IF NOT EXISTS idx_event_unprocessed
    ON events (organization_id, processed)
    WHERE processed = false;
