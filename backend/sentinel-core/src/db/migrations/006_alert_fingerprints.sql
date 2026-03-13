-- 006_alert_fingerprints.sql
-- Adds deterministic uniqueness to alerts to prevent race conditions in distributed execution environments.

-- We delete existing alerts since we are in dev and cannot cleanly backfill fingerprints for dummy data.
DELETE FROM alerts;

ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS fingerprint TEXT NOT NULL DEFAULT '';

-- Enforce global uniqueness on the fingerprint to prevent duplicate alert insertion
CREATE UNIQUE INDEX IF NOT EXISTS uniq_alert_fingerprint ON alerts (fingerprint);
