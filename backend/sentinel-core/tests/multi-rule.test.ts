import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { detectionEngine } from '../src/core/detection.engine.js';
import Fastify from 'fastify';

test('Multi-Rule Detection Engine Integration', async (t) => {
    // Purge the system for clean isolation runs
    await db.query('TRUNCATE table organizations CASCADE');

    // 1. Setup DB Context
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Multi Rule Context', 'multi-context', 'multi-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    const devRes = await db.query("INSERT INTO devices (organization_id, device_name, public_key) VALUES ($1, 'Compromised Node', 'none') RETURNING id", [orgId]);
    const deviceId = devRes.rows[0].id;

    // Initialize the Native Engine
    const app = Fastify();
    await detectionEngine.initialize(app);

    await t.test('A high volume of administrative role elevations should simultaneously trigger Burst Anomaly AND Privilege Escalation modules', async () => {
        // Preload 100 identical events into the DB to trip the burst sliding window mechanism natively
        const insertBatch = [];
        for (let i = 0; i < 99; i++) {
            insertBatch.push(
                db.query(
                    "INSERT INTO events (organization_id, device_id, event_type, payload, signature, integrity_hash) VALUES ($1, $2, 'user_role_updated', $3, 'sig', 'hash')",
                    [orgId, deviceId, { target_user_id: 'target', previous_role: 'viewer', new_role: 'admin', actor_id: 'actor' }]
                )
            );
        }
        await Promise.all(insertBatch);

        // The 100th definitive event
        const anchorEventRes = await db.query(
            "INSERT INTO events (organization_id, device_id, event_type, payload, signature, integrity_hash) VALUES ($1, $2, 'user_role_updated', $3, 'sig', 'hash') RETURNING *",
            [orgId, deviceId, { target_user_id: 'target-100', previous_role: 'viewer', new_role: 'admin', actor_id: 'actor-100' }]
        );
        const anchorEvent = anchorEventRes.rows[0];

        // Execute the Detection Engine strictly synchronously for assertions
        await detectionEngine.execute(anchorEvent, orgId);

        // 1. Assert Privilege Escalation fired
        const privRes = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND type = 'privilege_escalation'", [orgId]);
        assert.equal(privRes.rowCount, 1, 'Privilege escalation rule missed the execution');

        // 2. Assert Burst Anomaly fired symmetrically
        const burstRes = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND type = 'device_anomaly_burst'", [orgId]);
        assert.equal(burstRes.rowCount, 1, 'Device anomaly volume metric rule missed the execution');

    });

    t.after(async () => {
        await app.close?.(); // Close fastify cleanly
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
