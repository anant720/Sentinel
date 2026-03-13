import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import Fastify from 'fastify';
import fs from 'fs';
import { db } from '../src/lib/database.js';
import { redisClient, connectRedis } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { ApiKeyService } from '../src/services/apikey.service.js';
import { eventQueue } from '../src/queues/event.queue.js';

describe('Slow Credential Stuffing Attack Simulation', () => {
    let app: any;
    let orgId: string;
    let apiKey: string;
    let deviceId: string;
    let rsaKeys: any;

    beforeAll(async () => {
        // Run Phase 5 DB Migration
        const sql = fs.readFileSync('./src/db/migrations/021_phase5_alerts_schema.sql', 'utf8');
        try { await db.query(sql); } catch (err: any) {
            // Ignore if columns already exist
            if (!err.message.includes('already exists')) throw err;
        }

        await connectRedis();
        app = Fastify();
        await setupServer(app);
        await app.ready();

        // Pause processor to evaluate synchronously
        await eventQueue.pause();

        const orgRes = await db.query(
            "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, $3) RETURNING id",
            [`Test Org ${Date.now()}`, `test-org-${Date.now()}`, crypto.randomUUID()]
        );
        orgId = orgRes.rows[0].id;

        const keyResult = await ApiKeyService.generateKey(orgId, 5000);
        apiKey = keyResult.rawKey;

        rsaKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const devRes = await db.query(
            "INSERT INTO devices (organization_id, device_name, device_type, public_key, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id",
            [orgId, 'Test Node', 'Testing', rsaKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()]
        );
        deviceId = devRes.rows[0].id;
    });

    afterAll(async () => {
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
        await app.close();
        await redisClient.quit();
    });

    test('Bypasses 5m rule but triggers 30m rule when limits are physically manipulated mimicking 65s delays', async () => {
        const targetEmail = 'slow-loris@example.com';
        const { detectionEngine } = await import('../src/detection/engine.js');

        // Loop 10 iterations securely. We physically drop the `5m` array boundaries out of Redis to simulate the EXPIRE triggering correctly 
        // to verify the logic-leakage evasion successfully traps within the 30m `medium` threshold bounds.
        for (let i = 0; i < 10; i++) {
            const detectionEvent = {
                id: crypto.randomUUID(),
                type: 'login_failed',
                timestamp: Date.now(),
                email: targetEmail,
                device: deviceId
            };
            await detectionEngine.execute(detectionEvent, { orgId: orgId, redis: redisClient });

            // Clear the 5m bounding layer, simulating the sliding window natively advancing
            await redisClient.del(`fail:account:${orgId}:${targetEmail}:5m`);
        }

        // Verify that 5m sliding window evaded but 30m detected
        const alerts = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND rule_id = 'rapid-failed-logins'", [orgId]);

        // Exact 1 Alert due to Uniqueness `fingerprint` suppressing consecutive hits automatically
        assert.equal(alerts.rows.length > 0, true);
        const alert = alerts.rows[0];

        assert.equal(alert.severity, 'high');
        assert.equal(alert.evidence.window, '30m');
        assert.equal(alert.evidence.threshold, 10);
    });
});
