-- 017_events_partitioning.sql
-- Converts the events table to RANGE partitioning by created_at (monthly)
-- and pre-creates partitions for 2026.
--
-- Strategy:
--   1. Rename the existing events table to events_legacy
--   2. Create a new partitioned parent table
--   3. Migrate all existing data into the correct partitions
--   4. Create a stored function + helper to auto-create future partitions
--
-- IMPORTANT: This migration is idempotent — safe to run multiple times.

-- Step 1: Only proceed if events is not already partitioned
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'events'
          AND c.relkind = 'p'  -- 'p' = partitioned table
          AND n.nspname = 'public'
    ) THEN
        -- Rename existing table to legacy
        ALTER TABLE events RENAME TO events_legacy;

        -- Drop old indexes (they belong to events_legacy now)
        DROP INDEX IF EXISTS idx_event_org;
        DROP INDEX IF EXISTS idx_event_device;
        DROP INDEX IF EXISTS idx_event_type;
        DROP INDEX IF EXISTS idx_events_processed_at;
    END IF;
END;
$$;

-- Step 2: Create the new partitioned parent table (if not yet partitioned)
CREATE TABLE IF NOT EXISTS events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    integrity_hash VARCHAR(64) NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Step 3: Pre-create monthly partitions for 2026
CREATE TABLE IF NOT EXISTS events_2026_01 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE IF NOT EXISTS events_2026_02 PARTITION OF events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS events_2026_03 PARTITION OF events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS events_2026_04 PARTITION OF events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS events_2026_05 PARTITION OF events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS events_2026_06 PARTITION OF events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS events_2026_07 PARTITION OF events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS events_2026_09 PARTITION OF events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS events_2026_10 PARTITION OF events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS events_2026_11 PARTITION OF events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS events_2026_12 PARTITION OF events
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Safe catch-all partition for anything outside defined ranges
CREATE TABLE IF NOT EXISTS events_overflow PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Step 4: Migrate legacy data into the new partitioned table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events_legacy') THEN
        INSERT INTO events
        SELECT id, organization_id, device_id, event_type, payload,
               signature, integrity_hash, processed, processed_at, created_at
        FROM events_legacy
        ON CONFLICT DO NOTHING;

        -- Rename legacy table to events_migrated (keep as backup)
        ALTER TABLE events_legacy RENAME TO events_migrated;
    END IF;
END;
$$;

-- Step 5: Partition-local indexes (applied on each partition automatically)
CREATE INDEX IF NOT EXISTS idx_events_org_created ON events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_org_type    ON events(organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_processed   ON events(processed) WHERE processed = false;

-- Step 6: Helper function to create the next month's partition automatically
CREATE OR REPLACE FUNCTION create_events_partition_for_month(target_date DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', target_date)::DATE;
    end_date   := (DATE_TRUNC('month', target_date) + INTERVAL '1 month')::DATE;
    partition_name := 'events_' || TO_CHAR(target_date, 'YYYY_MM');

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF events
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;
