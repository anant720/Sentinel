/**
 * Chaos Validation 
 * Phase D - Payload Flood Test 
 */

import crypto from 'crypto';
import { db } from '../src/lib/database.js';
import Fastify from 'fastify';
import { connectRedis, redisClient } from '../src/lib/redis.js';
import { setupServer } from '../src/index.js';
import { ApiKeyService } from '../src/services/apikey.service.js';
import { eventQueue } from '../src/queues/event.queue.js';

const start = async () => {
    console.log("==========================================");
    console.log("PHASE D: PAYLOAD FLOOD TEST (THROUGHPUT)");
    console.log("==========================================");

    await connectRedis();
    const app = Fastify();
    await setupServer(app);
    await app.ready();

    // Setup Sandbox Org
    const orgRes = await db.query(
        "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, 'test-hash') RETURNING id",
        [`Chaos Phase D ${Date.now()}`, `chaos-d-${Date.now()}`]
    );
    const orgId = orgRes.rows[0].id;

    // Massively over-provision key limit to cleanly evaluate actual IOPS throughput natively without 429 rejections blocking benchmark measurements.
    const keyResult = await ApiKeyService.generateKey(orgId, 50000);
    const orgApiKey = keyResult.rawKey;

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const devRes = await db.query(
        "INSERT INTO devices (organization_id, device_name, device_type, public_key, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id",
        [orgId, 'Flood Node', 'Testing', pemPublic]
    );
    const deviceId = devRes.rows[0].id;

    // Helper: Build Canonical Event & Mock Auth
    const buildEventAndSign = () => {
        const event = {
            device_id: deviceId,
            event_type: 'login_attempt',
            timestamp: Date.now(),
            nonce: crypto.randomUUID(),
            payload: { user_id: crypto.randomUUID(), timestamp: Date.now(), email: 'flood@example.com', success: true }
        };
        const canonicalDict = Object.fromEntries(Object.keys(event).sort().map(key => [key, (event as any)[key]]));
        const sign = crypto.createSign('SHA256');
        sign.update(JSON.stringify(canonicalDict));
        return { event, signature: sign.sign(privateKey, 'hex') };
    };

    const runFlood = async (ratePerSec: number, durationSecs: number) => {
        console.log(`\nStarting Flood Test: ${ratePerSec} Requests / Second (Duration: ${durationSecs}s)`);
        let requestsCompleted = 0;
        const promises: Promise<any>[] = [];
        const startExecution = performance.now();

        for (let s = 0; s < durationSecs; s++) {
            for (let i = 0; i < ratePerSec; i++) {
                promises.push(app.inject({
                    method: 'POST',
                    url: '/events/ingest',
                    headers: { authorization: `Bearer ${orgApiKey}` },
                    payload: buildEventAndSign()
                }).then(res => {
                    requestsCompleted++;
                    return res;
                }));
            }
            // Add native pseudo-thread spacing to roughly mimic CPS bursts in Node 
            await new Promise(r => setTimeout(r, 1000));
        }

        await Promise.all(promises);
        const duration = performance.now() - startExecution;
        console.log(`Completed ${requestsCompleted} requests in ${duration.toFixed(2)}ms`);
        console.log(`Effective IOPS: ${((requestsCompleted / duration) * 1000).toFixed(2)} req/sec`);

        // Measure BullMQ backlog
        const jobCounts = await eventQueue.getJobCounts('wait', 'active', 'completed', 'failed');
        console.log(`BullMQ Backlog State: `, jobCounts);
        // Wipe queue between runs for clean boundaries
        await eventQueue.obliterate({ force: true });
    };

    // Note: Emulating 5000req/sec strictly via Node `app.inject` locally natively exhausts V8 Memory boundaries statically. 
    // We will benchmark 100, 500 and 1000 organically using mock thread delays.
    await runFlood(100, 2);
    await runFlood(500, 2);
    await runFlood(1000, 2);

    console.log("\nPhase D Complete.");

    await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    await app.close();
    await redisClient.quit();
    process.exit(0);
};

start();
