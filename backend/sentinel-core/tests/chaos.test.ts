import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import { connectRedis, redisClient } from '../src/lib/redis.js';
import { IngestionController } from '../src/controllers/ingestion.controller.js';
import * as EventQueue from '../src/queues/event.queue.js';
import { DeviceService } from '../src/services/device.service.js';
import Fastify from 'fastify';

test('Chaos Engineering Simulations', async (t) => {
    await connectRedis();

    const orgRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Chaos Org', 'chaos-org', 'chaos-hash') RETURNING id");
    const orgId = orgRes.rows[0].id;

    const devRes = await db.query("INSERT INTO devices (organization_id, device_name, public_key) VALUES ($1, 'Chaos Node', 'none') RETURNING id", [orgId]);
    const deviceId = devRes.rows[0].id;

    const app = Fastify();
    app.post('/ingest', (req, reply) => {
        // Mock Org mapping native to the auth loop
        (req as any).orgId = orgId;
        return IngestionController.ingest(req as any, reply);
    });

    const mockPayload = {
        device_id: deviceId,
        event_type: 'chaos_test',
        timestamp: Date.now(),
        payload: { test: true },
        signature: 'ignored'
    };

    // Bypass structural RSA CPU overhead
    const originalVerify = DeviceService.verifySignature;
    DeviceService.verifySignature = () => true;

    await t.test('Redis Down: Queue unavailability bubbles safe graceful 500 degradation without fundamentally crashing the Node process', async () => {
        // Stub enqueueEvent to dynamically simulate Mid-Flight Redis connection loss
        const originalAdd = EventQueue.eventQueue.add;
        EventQueue.eventQueue.add = async () => {
            throw new Error('Redis connection lost');
        };

        const res = await app.inject({
            method: 'POST',
            url: '/ingest',
            payload: mockPayload
        });

        assert.equal(res.statusCode, 500, 'Ingestion correctly yielded 500 Graceful Degradation handling the Queue disconnect');
        const body = JSON.parse(res.payload);
        assert.equal(body.error, 'Internal Server Error', 'Safely obscured underlying infrastructure specifics from the Client');

        // Restore Mock
        EventQueue.eventQueue.add = originalAdd;
    });

    await t.test('Postgres Connection Loss: DB unreachability safely aborts transaction cleanly', async () => {
        // Mock DB Query fundamental network failure
        const originalQuery = db.query;
        let dbCalled = false;

        db.query = async (...args: any[]) => {
            dbCalled = true;
            throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        };

        const res = await app.inject({
            method: 'POST',
            url: '/ingest',
            payload: mockPayload
        });

        assert.equal(res.statusCode, 500, 'Handled POSTGRES failure boundary gracefully exiting the controller');
        assert.ok(dbCalled, 'Definitively attempted to hit the Database mapping');

        // Restore Mock
        db.query = originalQuery;
    });

    await t.test('Partial Network Delay: Simulating heavy simultaneous DB locks evaluating geometric concurrency safety caps', async () => {
        // Artificially inject strictly 50ms latencies natively into the DB driver. Push 10 parallel transactions.
        const originalQuery = db.query;
        let concurrentQueries = 0;
        let maxConcurrent = 0;

        db.query = async (text: string, params?: any[]) => {
            concurrentQueries++;
            maxConcurrent = Math.max(maxConcurrent, concurrentQueries);

            await new Promise(r => setTimeout(r, 50)); // Artificial physical latency

            concurrentQueries--;
            return originalQuery.call(db, text, params);
        };

        const promises = Array.from({ length: 10 }).map(() => app.inject({
            method: 'POST',
            url: '/ingest',
            payload: mockPayload
        }));

        const results = await Promise.all(promises);

        // Assert they overlapped heavily in Node's memory strictly without DB Client deadlocking the pool
        assert.ok(maxConcurrent > 1, 'Queries executed concurrently overlapping structurally without deadlocks');
        assert.equal(results.filter(r => r.statusCode === 202).length, 10, 'All delayed parallel queries succeeded safely and were physically queued');

        // Restore Mock
        db.query = originalQuery;
    });

    t.after(async () => {
        DeviceService.verifySignature = originalVerify;
        await app.close();
        await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
        await redisClient.quit();
    });
});
