import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import Fastify from 'fastify';
import { db } from '../src/lib/database.js';
import { redisClient, connectRedis } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { ApiKeyService } from '../src/services/apikey.service.js';
import { eventQueue } from '../src/queues/event.queue.js';

describe('Risk Scoring & Adaptive Rate Limiting', () => {
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
            [`Test Org ${Date.now()}`, `test-org-risk-${Date.now()}`, crypto.randomUUID()]
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

    test('Injects critical risk bounds explicitly generating HTTP 429 adaptive blocks mapped to High-Risk entity', async () => {
        const targetEmail = `risky-actor-${Date.now()}@example.com`;

        const sendPayload = async (type: string, timestampMod: number) => {
            const event = {
                device_id: deviceId,
                event_type: type,
                timestamp: Date.now() - timestampMod,
                nonce: crypto.randomUUID(),
                payload: {
                    email: targetEmail,
                    user_id: 'test-user-id',
                    timestamp: Date.now()
                }
            };
            const canonicalDict = Object.fromEntries(Object.keys(event).sort().map(key => [key, (event as any)[key]]));
            const sign = crypto.createSign('SHA256');
            sign.update(JSON.stringify(canonicalDict));

            return await app.inject({
                method: 'POST',
                url: '/events/ingest',
                headers: { authorization: `Bearer ${apiKey}` },
                payload: { event, signature: sign.sign(rsaKeys.privateKey, 'hex') }
            });
        };

        // 1. Manually assign a Risk Score of 100 representing Critical Bounds
        await redisClient.set(`risk:account:${orgId}:${targetEmail}`, "100");

        // 2. Transmit standard payload. The Adaptive Limiter in Fastify should deny immediately via 429.
        const res = await sendPayload('login_success', 0);

        assert.equal(res.statusCode, 429);
        const json = res.json() as any;
        assert.equal(json.message.includes('Critical Risk'), true);
    });
});
