/**
 * Chaos Validation 
 * Phase A - High Concurrency Replay Attack Test
 */

import crypto from 'crypto';
import { db } from '../src/lib/database.js';
import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { redisClient, connectRedis } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { ApiKeyService } from '../src/services/apikey.service.js';

const start = async () => {
    console.log("==========================================");
    console.log("PHASE A: HIGH CONCURRENCY REPLAY ATTACK TEST");
    console.log("==========================================");

    await connectRedis();
    const app = Fastify();
    await setupServer(app);
    await app.ready();

    // 1. Setup Sandbox Org directly in DB
    const orgRes = await db.query(
        "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, 'test-hash') RETURNING id",
        [`Chaos Phase A ${Date.now()}`, `chaos-${Date.now()}`]
    );
    const orgId = orgRes.rows[0].id;

    // 2. Provision Global API Key via Service
    const keyResult = await ApiKeyService.generateKey(orgId, 10000);
    const orgApiKey = keyResult.rawKey;

    // 3. Generate RCA Device Keys
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // 4. Register Device explicitly
    const devRes = await db.query(
        "INSERT INTO devices (organization_id, device_name, device_type, public_key, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id",
        [orgId, 'Chaos Fuzzer', 'Testing', pemPublic]
    );
    const deviceId = devRes.rows[0].id;

    // Helper: Build Canonical Event & Mock Auth
    const buildEventAndSign = (nonce: string, timestampMod = 0) => {
        const event = {
            device_id: deviceId,
            event_type: 'login_attempt',
            timestamp: Date.now() + timestampMod,
            nonce,
            payload: {
                user_id: crypto.randomUUID(),
                timestamp: Date.now(),
                email: 'chaos@example.com',
                success: true
            }
        };
        const canonicalDict = Object.fromEntries(Object.keys(event).sort().map(key => [key, (event as any)[key]]));
        const canonicalStr = JSON.stringify(canonicalDict);
        const sign = crypto.createSign('SHA256');
        sign.update(canonicalStr);
        const signature = sign.sign(privateKey, 'hex');

        return { event, signature };
    };

    const fireConcurrentRequests = async (count: number, payloadGenerator: (i: number) => any) => {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(app.inject({
                method: 'POST',
                url: '/events/ingest',
                headers: { authorization: `Bearer ${orgApiKey}` },
                payload: payloadGenerator(i)
            }));
        }
        const startExecution = performance.now();
        const results = await Promise.all(promises);
        const duration = performance.now() - startExecution;

        const statusCounts = results.reduce((acc: any, res) => {
            acc[res.statusCode] = (acc[res.statusCode] || 0) + 1;
            return acc;
        }, {});

        return { statusCounts, durationMs: duration };
    };

    console.log("--- Scenario 1: 100 identical requests at the exact same millisecond ---");
    const nonce1 = crypto.randomUUID();
    const payload1 = buildEventAndSign(nonce1);
    const res1 = await fireConcurrentRequests(100, () => payload1);
    console.log(`Duration: ${res1.durationMs.toFixed(2)}ms`);
    console.log(`Accepted (202): ${res1.statusCounts[202] || 0}`);
    console.log(`Rejected (401 Replay): ${res1.statusCounts[401] || 0}`);

    console.log("\n--- Scenario 2: 1000 identical requests across parallel threads ---");
    const nonce2 = crypto.randomUUID();
    const payload2 = buildEventAndSign(nonce2);
    // Note: Due to Node event loop depth, 1000 HTTP injects natively will spike CPU but test exact logical boundaries safely
    const res2 = await fireConcurrentRequests(1000, () => payload2);
    console.log(`Duration: ${res2.durationMs.toFixed(2)}ms`);
    console.log(`Accepted (202): ${res2.statusCounts[202] || 0}`);
    console.log(`Rejected (401 Replay): ${res2.statusCounts[401] || 0}`);
    console.log(`Rejected Rate Limit (429): ${res2.statusCounts[429] || 0}`);

    console.log("\n--- Scenario 3: 50 concurrent requests slightly modified (Drift variants) ---");
    const res3 = await fireConcurrentRequests(50, (i) => buildEventAndSign(crypto.randomUUID(), i * 10)); // tiny timestamp shifts, same nonce logic bypass
    console.log(`Duration: ${res3.durationMs.toFixed(2)}ms`);
    console.log(`Accepted (202): ${res3.statusCounts[202] || 0}`);
    console.log(`Rejected (401): ${res3.statusCounts[401] || 0}`);

    console.log("\nPhase A Complete.");

    // Cleanup
    await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    await app.close();
    await redisClient.quit();
    process.exit(0);
};

start();
