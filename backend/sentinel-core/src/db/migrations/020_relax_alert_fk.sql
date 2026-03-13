-- Migration 020: Relax Alerts Foreign Key
-- Dropping the foreign key constraint on `alerts.event_id` referencing `events(id)`
-- because migration 017 partitioned the events table, and PostgreSQL does not natively
-- support foreign keys pointing to partitioned tables without strict partition-key bounds.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_event_id_fkey;
