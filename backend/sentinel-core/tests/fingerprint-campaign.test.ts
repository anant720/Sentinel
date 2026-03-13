import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import Fastify from 'fastify';
import { db } from '../src/lib/database.js';
import { redisClient, connectRedis } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { ApiKeyService } from '../src/services/apikey.service.js';
import { eventQueue } from '../src/queues/event.queue.js';
import { detectionEngine } from '../src/detection/engine.js';

describe('Fingerprint Campaign Simulation', () => {
    let app: any;
    let orgId: string;
    let apiKey: string;
    let deviceId: string;
    let rsaKeys: any;

    beforeAll(async () => {
        await connectRedis();
        app = Fastify();
        await setupServer(app);
        await app.ready();
        await eventQueue.pause();

        const orgRes = await db.query(
            "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, $3) RETURNING id",
            [`Test Org ${Date.now()}`, `test-org-fingerprint-${Date.now()}`, crypto.randomUUID()]
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

    test('Triggers when 50 identical fingerprints are executed across distinct targets', async () => {
        const attackIp = '88.10.4.5';
        const userAgent = 'curl/7.68.0'; // Static footprint across requests

        for (let i = 0; i < 50; i++) {
            const event = {
                id: crypto.randomUUID(),
                type: 'auth_init',
                timestamp: Date.now(),
                email: `unique-target-${i}@example.com`,
                ip: attackIp,
                userAgent: userAgent,
                device: deviceId
            };

            await detectionEngine.execute(event, { orgId: orgId, redis: redisClient });
        }

        const alerts = await db.query("SELECT * FROM alerts WHERE organization_id = $1 AND rule_id = 'fingerprint-campaign'", [orgId]);

        assert.equal(alerts.rows.length >= 1, true);
        const alert = alerts.rows[0];

        assert.equal(alert.severity, 'high');
        assert.equal(alert.evidence.count, 50);
        // Ensure entity is the hashed fingerprint structurally
        assert.equal(alert.entity.length, 12);
    });
});
