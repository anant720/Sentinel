import { logger } from '../src/lib/logger.js';
import { generateSecureToken } from '../src/security/index.js';
import { pool } from '../src/db/client.js';
import { config } from '../src/config/index.js';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { randomUUID, generateKeyPairSync, createSign } from 'node:crypto';

async function runDedupeVerification() {
    logger.info('Bootstrapping Concurrent Distributed Deduplication Baseline');

    const orgId = '22222222-2222-2222-2222-222222222222';
    await pool.query(`
        INSERT INTO organizations (id, name, slug, api_key_hash) 
        VALUES ($1, 'Dedupe Test Org', 'dedupe-test-org', 'mock-hash-123') 
        ON CONFLICT (id) DO NOTHING
    `, [orgId]);

    const hardwareToken = randomUUID();

    // Generate valid RSA pair to pass Device verification
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    await pool.query(`
        INSERT INTO devices (id, organization_id, device_name, public_key, is_active) 
        VALUES ($1, $2, 'concurrent-agent', $3, true) 
        ON CONFLICT (id) DO NOTHING
    `, [hardwareToken, orgId, publicKey]);

    // Build a local Fastify app just for signing a valid test token
    const app = Fastify();
    await app.register(fastifyJwt, { secret: config.JWT_SECRETS_MAP[config.JWT_ACTIVE_KID]! });

    // Create an Analyst token with EVENT_INGEST privileges
    const analystToken = app.jwt.sign({
        user_id: randomUUID(),
        organization_id: orgId,
        role: 'analyst'
    }, {
        header: { kid: config.JWT_ACTIVE_KID, alg: 'HS256' }
    });

    // Force unique criteria for this test run so we can count it
    const runId = Math.random().toString(36).substring(7);

    const testEmail = `victim-${runId}@example.com`;
    const payloadObject = { email: testEmail, user: 'SYSTEM', runId };
    const payloadString = JSON.stringify(payloadObject);

    const signer = createSign('SHA256');
    signer.update(payloadString);
    signer.end();
    const signature = signer.sign(privateKey, 'hex');

    const syntheticPayload = JSON.stringify({
        device_id: hardwareToken,
        event_type: 'login_failed',
        timestamp: Date.now(),
        signature: signature,
        payload: payloadObject
    });

    logger.info('Firing 10 exact duplicate critical payloads simultaneously across NGINX Round Robin bounds...');

    // Fire 10 concurrent exactly identical requests simulating Cache Stampede / Alert Race Condition
    const responses = await Promise.all(
        Array.from({ length: 10 }).map(() =>
            fetch('http://localhost:80/events/ingest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${analystToken}`
                },
                body: syntheticPayload
            }).then(async res => {
                if (!res.ok) {
                    const text = await res.text();
                    logger.error(`Failed response body ${res.status}: ${text}`);
                }
                return res.status;
            })
        )
    );
    const statuses = responses; // responses now directly contains statuses
    logger.info(`Received API Statuses: ${statuses.join(', ')}`);

    // Give BullMQ workers 2 seconds to process the queue thoroughly
    await new Promise(resolve => setTimeout(resolve, 2000));

    // We expect exactly 1 alert to be generated because the detection engine
    // leverages robust Redis Locking / Hash matching to prevent duplicate escalation alerts.
    // We confirm that our database logic guarantees consistency under High Concurrency.

    const result = await pool.query(`
        SELECT count(*) FROM alerts 
        WHERE organization_id = $1 
        AND type = 'rapid_failed_login'
        AND metadata->>'email' = $2
    `, [orgId, testEmail]);

    const count = parseInt(result.rows[0].count, 10);
    logger.info(`Total Alerts physically mapped for logical execution: ${count}`);

    if (count === 1) {
        logger.info('✅ SUCCESS: Distributed Alert Deduplication safely mitigated parallel race conditions cleanly!');
    } else {
        logger.error(`❌ FAILURE: Detected ${count} alerts, structural race condition leakage bound.`);
        process.exit(1);
    }

    pool.end();
}

runDedupeVerification();
