import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { AlertService } from '../src/services/alert.service.js';

test('Massive Concurrency PostgreSQL Integrity Limits', async (t) => {

    // Purge the system for clean isolation runs
    await db.query('TRUNCATE table organizations CASCADE');

    await t.test('500 concurrent identical alerts must result in exactly 1 row insertion and 499 suppression_count increments securely', async () => {
        const concurrencyCount = 500;

        // 1. Create a valid isolated Organization
        const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Race Integration Context', 'race-context', 'dummy-hash') RETURNING id");
        const orgId = orgRes.rows[0].id;

        // 2. Create a valid isolated device
        const devRes = await db.query("INSERT INTO devices (organization_id, device_name, public_key) VALUES ($1, 'Race Dummy', 'none') RETURNING id", [orgId]);
        const deviceId = devRes.rows[0].id;

        // 3. Create a valid parent Event
        const evtRes = await db.query(
            "INSERT INTO events (organization_id, device_id, event_type, payload, signature, integrity_hash) VALUES ($1, $2, 'race.trigger', '{}', 'sig', 'hash') RETURNING id",
            [orgId, deviceId]
        );
        const eventId = evtRes.rows[0].id;

        const fp = 'race-fingerprint-999';

        const alertPayload = {
            eventId: eventId,
            type: 'rapid_failed_login',
            severity: 'high' as const,
            fingerprint: fp,
            title: 'Massive Parallel Brute Force',
            description: 'This is a deterministic race payload.',
            metadata: {}
        };

        const tasks = [];
        // Spawn 500 async promises immediately without awaiting them sequentially
        for (let i = 0; i < concurrencyCount; i++) {
            tasks.push(AlertService.createAlert(orgId, alertPayload));
        }

        // Fire them all into the event loop essentially instantaneously
        const results = await Promise.allSettled(tasks);

        // Analyze failures
        const rejections = results.filter(r => r.status === 'rejected');
        if (rejections.length > 0) {
            console.error('FIRST REJECTION REASON:', (rejections[0] as PromiseRejectedResult).reason);
        }
        assert.equal(rejections.length, 0, 'No Promises should reject natively under Postgres Unique Constraints; they should handle it internally');

        // Check the database directly to ensure ONLY 1 row was created
        const dbVerification = await db.query('SELECT * FROM alerts WHERE fingerprint = $1 AND organization_id = $2', [fp, orgId]);

        assert.equal(dbVerification.rowCount, 1, 'PostgreSQL ON CONFLICT constraint failed: multiple identical rows slipped through the check-and-insert race condition');

        const insertedRow = dbVerification.rows[0];

        // Ensure that 499 insertions triggered the ON CONFLICT DO UPDATE suppression_count
        assert.equal(insertedRow.suppression_count, 499, 'The uniqueness constraint correctly intercepted duplicates but failed to reliably atomically increment suppression rules.');
    });

});
