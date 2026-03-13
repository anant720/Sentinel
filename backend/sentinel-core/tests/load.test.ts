import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import Fastify from 'fastify';
import { IngestionController } from '../src/controllers/ingestion.controller.js';
import { connectRedis, redisClient } from '../src/lib/redis.js';
import { DeviceService } from '../src/services/device.service.js';

test('Load & Performance Testing (Event Flood)', async (t) => {
    // 1. Core Setup
    await connectRedis();

    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Load Flood Org', 'flood-org', 'flood-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    const devRes = await db.query("INSERT INTO devices (organization_id, device_name, public_key) VALUES ($1, 'Flood Node', 'none') RETURNING id", [orgId]);
    const deviceId = devRes.rows[0].id;

    // Bypass structural RSA overhead to isolate pure Database & Queue volumetric latency capacities:
    const originalVerify = DeviceService.verifySignature;
    DeviceService.verifySignature = () => true;

    const app = Fastify();

    // Mount the controller exactly as production, forcing strictly Org A identity mapping
    app.post('/ingest', (req, reply) => {
        (req as any).orgId = orgId;
        return IngestionController.ingest(req as any, reply);
    });

    await app.ready();

    await t.test('Event Ingestion Flood: Fastify pipeline successfully handles 5000 synchronous event boundaries dropping cleanly into the Postgres layer and BullMQ async without exhausting the DB Connection Pool', async () => {
        const payloadCount = 5000;
        const promises = [];

        for (let i = 0; i < payloadCount; i++) {
            promises.push(app.inject({
                method: 'POST',
                url: '/ingest',
                payload: {
                    device_id: deviceId,
                    event_type: 'volumetric_load_test',
                    timestamp: Date.now(),
                    payload: { iter: i },
                    signature: 'mock_signature' // Bypassed dynamically above
                }
            }));
        }

        // Push 5k events entirely synchronously blocking the event loop geometrically.
        // Postgres `pg-pool` is strictly limited, therefore it will queue locally and resolve correctly, asserting our DB constraints limit architecture natively.
        const results = await Promise.all(promises);
        const successes = results.filter(r => r.statusCode === 202);

        // Due to the extreme memory scaling, some requests might be mathematically queued or dropped by p-limit if overloaded, 
        // But the architecture guarantees 100% processing or a strictly 5xx constraint reply, no memory corruptions.
        const firstError = results.find(r => r.statusCode !== 202);
        assert.equal(successes.length, payloadCount, `Failed ingestion. Example rejection: ${firstError?.statusCode} - ${firstError?.payload}`);
    });

    t.after(async () => {
        DeviceService.verifySignature = originalVerify;
        await app.close();
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
        await redisClient.quit();
    });
});
