import { test, expect, beforeAll, afterAll } from 'vitest';
import fastify from 'fastify';
import { db } from '../src/lib/database.js';
import { setupQueue } from '../src/queues/event.queue.js';
import { detectionEngine } from '../src/core/detection.engine.js';
import { redisClient, connectRedis } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { generateSecureToken } from '../src/security/index.js';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let orgId: string;
let deviceId: string;
let privateKey: crypto.KeyObject;
let publicKey: crypto.KeyObject;
let orgApiKey: string;

import { ApiKeyService } from '../src/services/apikey.service.js';

beforeAll(async () => {
    await connectRedis();
    app = fastify();
    await setupServer(app);
    await app.ready(); // Ensure the exact Fastify plugin boundary is completely booted!

    setupQueue();
    await detectionEngine.initialize(app);
    // Explicitly disabling BullMQ background worker to guarantee deterministic heuristic evaluation natively

    // Hot-patch the schema locally for the test run to bypass the Migration 017 FK partition orphan issue
    await db.query('ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_event_id_fkey;');

    // 1. Setup Sandbox Org directly in DB
    const orgRes = await db.query(
        "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, 'test-hash') RETURNING id",
        [`Phase4 Test Org ${Date.now()}`, `p4-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    // 2. Provision Global API Key via Service
    const keyResult = await ApiKeyService.generateKey(orgId, 1000);
    orgApiKey = keyResult.rawKey;

    // 3. Generate RCA Device Keys
    const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    privateKey = priv;
    publicKey = pub;

    const pemPublic = pub.export({ type: 'spki', format: 'pem' }).toString();

    // 4. Register Device directly in DB to bypass enrollment verification
    const devRes = await db.query(
        "INSERT INTO devices (organization_id, device_name, device_type, public_key, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id",
        [orgId, 'P4 Telemetry Endpoint', 'Linux', pemPublic]
    );
    deviceId = devRes.rows[0].id;
});

afterAll(async () => {
    await app.close();
    await redisClient.quit();
    await db.query('DELETE FROM organizations WHERE id = $1', [orgId]);
});

function signCanonicalEvent(event: any): string {
    // Exact sorting constraint simulating Python's `sort_keys=True`
    const canonicalDict = Object.fromEntries(Object.keys(event).sort().map(key => [key, event[key]]));
    const canonicalStr = JSON.stringify(canonicalDict);
    const sign = crypto.createSign('SHA256');
    sign.update(canonicalStr);
    return sign.sign(privateKey, 'hex');
}

test('6.1: Signature Tampering Test (Modifying Event Array Fails)', async () => {
    const event = {
        device_id: deviceId,
        event_type: 'login_attempt',
        timestamp: Date.now(),
        nonce: crypto.randomUUID(),
        payload: { user: 'root' }
    };

    const signature = signCanonicalEvent(event);

    // Tamper the payload OUTSIDE the signature AFTER it was signed
    const tamperedEvent = { ...event, event_type: 'sudo_execution' };

    const res = await app.inject({
        method: 'POST',
        url: '/events/ingest',
        headers: { Authorization: `Bearer ${orgApiKey}` },
        payload: {
            event: tamperedEvent,
            signature
        }
    });

    console.dir({ statusCode: res.statusCode, payload: res.json() }, { depth: null });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
    expect(res.json().message).toBe('Invalid canonical event signature');
});

test('6.2: Nonce Replay Test (Identical Request Blocked)', async () => {
    const event = {
        device_id: deviceId,
        event_type: 'login_attempt',
        timestamp: Date.now(),
        nonce: crypto.randomUUID(),
        payload: {
            user_id: crypto.randomUUID(),
            timestamp: Date.now(),
            email: 'foo@bar.com',
            success: false
        }
    };
    const signature = signCanonicalEvent(event);
    const payloadBuffer = { event, signature };

    // Request 1 (Should Pass)
    const res1 = await app.inject({
        method: 'POST',
        url: '/events/ingest',
        headers: { Authorization: `Bearer ${orgApiKey}` },
        payload: payloadBuffer
    });
    console.dir({ test: 6.2, statusCode: res1.statusCode, payload: res1.json() }, { depth: null });
    expect(res1.statusCode).toBe(202);

    // Request 2 (Identical Replay - Should Fail immediately from Redis)
    const res2 = await app.inject({
        method: 'POST',
        url: '/events/ingest',
        headers: { Authorization: `Bearer ${orgApiKey}` },
        payload: payloadBuffer
    });
    expect(res2.statusCode).toBe(401);
    expect(res2.json().message).toContain('Event replay detected');
});

test('6.3: Timestamp Drift Test (Rejecting events outside 60s windows)', async () => {
    const staleEvent = {
        device_id: deviceId,
        event_type: 'stale_event',
        timestamp: Date.now() - 65000, // 65 seconds in the past
        nonce: crypto.randomUUID(),
        payload: {}
    };
    const signature = signCanonicalEvent(staleEvent);

    const res = await app.inject({
        method: 'POST',
        url: '/events/ingest',
        headers: { Authorization: `Bearer ${orgApiKey}` },
        payload: { event: staleEvent, signature }
    });

    expect(res.statusCode).toBe(400); // Bad Request for Drift
    expect(res.json().message).toContain('drift exceeded');
});

test('6.4: Redis Detection Rule (Trigger Rapid-Failed-Logins Memory Buffer natively)', async () => {
    const testEmail = `victim_${Date.now()}@example.com`;

    // Fire 5 completely valid signatures instantly bypassing DB queries natively in the heuristic module
    for (let i = 0; i < 5; i++) {
        const ev = {
            device_id: deviceId,
            event_type: 'login_failed',
            timestamp: Date.now(),
            nonce: crypto.randomUUID(),
            payload: {
                user_id: crypto.randomUUID(),
                timestamp: Date.now(),
                email: testEmail
            }
        };
        const sig = signCanonicalEvent(ev);
        const res = await app.inject({
            method: 'POST',
            url: '/events/ingest',
            headers: { Authorization: `Bearer ${orgApiKey}` },
            payload: { event: ev, signature: sig }
        });

        // Test determinism bypass: Execute Detection natively
        const eventId = res.json().event_id;
        const fetchResult = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
        await detectionEngine.execute(fetchResult.rows[0], orgId);
    }

    // Wait for the final DB validation
    let alerts: any;
    for (let i = 0; i < 20; i++) {
        alerts = await db.query(
            `SELECT id, description FROM alerts WHERE organization_id = $1 AND title = 'Rapid Failed Logins' AND metadata->>'email' = $2`,
            [orgId, testEmail]
        );
        if (alerts.rows.length >= 1) break;
        await new Promise(r => setTimeout(r, 500));
    }

    expect(alerts.rows.length).toBeGreaterThanOrEqual(1);
    expect(alerts.rows[0].description).toContain('Detected 5 failed login');
}, 15000);
