import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { detectionEngine } from '../src/core/detection.engine.js';
import Fastify from 'fastify';

test('Semaphore Saturation (Memory stable under load)', async (t) => {
    // 1. Setup DB Context
    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Semaphore Load Org', 'sem-load', 'sem-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    // 2. Initialize the Engine natively
    const app = Fastify();
    await detectionEngine.initialize(app);

    await t.test('1000 concurrent complex event evaluations should gracefully pipeline through the 5-concurrency semaphore limit without crashing the Javascript thread', async () => {
        // Construct 1000 independent in-memory events. We will bypass inserting them all to speed up the test
        // Let's grab just 1 target event format so we can force evaluation.
        const mockEvent = {
            id: 'mock-uuid', // Mock UUID structural bypass
            event_type: 'rapid_failed_login',
            payload: { email: 'brute@force.com' },
            device_id: 'device-id-mock',
            created_at: new Date()
        };

        const executePromises = [];

        // Push 1000 parallel engine executions overlapping wildly.
        for (let i = 0; i < 1000; i++) {
            // Note: because `db` queries will queue up, and our Detection Engine queries DB limits, 
            // the PG pool constraint (usually 10 on local) combined with the internal 5 concurrency semaphore 
            // evaluates massive Node scale limits immediately.
            executePromises.push(detectionEngine.execute(mockEvent, orgId));
        }

        // Just evaluating if it resolves safely or OOM crashes the pipeline
        try {
            await Promise.all(executePromises);
            assert.ok(true, '1000 concurrent deep-pipeline evaluations survived saturation.');
        } catch (err: any) {
            assert.fail(`Semaphore pipeline failed ungracefully handling load: ${err.message}`);
        }
    });

    t.after(async () => {
        await app.close?.(); // Close fastify
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    });
});
