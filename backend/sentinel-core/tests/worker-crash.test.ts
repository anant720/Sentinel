import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';

test('Worker Crash Mid-Processing (Idempotent recovery)', async (t) => {
    // 1. Setup DB Context
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Worker Crash Org', 'worker-org', 'worker-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    const devRes = await db.query("INSERT INTO devices (organization_id, device_name, public_key) VALUES ($1, 'Crash Node', 'none') RETURNING id", [orgId]);
    const deviceId = devRes.rows[0].id;

    await t.test('Processing an event twice should be mechanically idempotent', async () => {
        // Insert a raw event
        const eventRes = await db.query(
            "INSERT INTO events (organization_id, device_id, event_type, payload, signature, integrity_hash, processed) VALUES ($1, $2, 'test_event', '{}', 'sig', 'hash', false) RETURNING id",
            [orgId, deviceId]
        );
        const eventId = eventRes.rows[0].id;

        // Simulate Worker Phase 1
        const updateRes1 = await db.query(
            `UPDATE events
             SET processed = true, processed_at = NOW()
             WHERE id = $1 AND organization_id = $2 AND processed = false
             RETURNING id`,
            [eventId, orgId]
        );
        assert.equal(updateRes1.rowCount, 1, 'Event should be marked processed on first pass');

        // Simulate Worker CRASH exactly after phase 1, and the Queue retries Phase 2...
        const updateRes2 = await db.query(
            `UPDATE events
             SET processed = true, processed_at = NOW()
             WHERE id = $1 AND organization_id = $2 AND processed = false
             RETURNING id`,
            [eventId, orgId]
        );
        assert.equal(updateRes2.rowCount, 0, 'Atomic constraint should reject the second update completely');
    });

    t.after(async () => {
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
