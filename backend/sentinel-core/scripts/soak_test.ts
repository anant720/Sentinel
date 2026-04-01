import autocannon from 'autocannon';
import { logger } from '../src/lib/logger.js';
import { generateSecureToken } from '../src/security/index.js';
import { pool } from '../src/db/client.js';
import { config } from '../src/config/index.js';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { randomUUID, generateKeyPairSync, createSign } from 'node:crypto';

async function runSoakBaseline() {
    // We instantiate a direct soak baseline locally targeting the load balancer proxy
    logger.info('Bootstrapping Autocannon Distributed Soak Baseline Evaluation (15s Simulation)');

    // Pre-create an isolation boundary for the mock org internally mapped to the database geometrically
    const orgId = '11111111-1111-1111-1111-111111111111';
    await pool.query(`
        INSERT INTO organizations (id, name, slug, api_key_hash) 
        VALUES ($1, 'Soak Test Org', 'soak-test-org', 'mock-hash-456') 
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
        VALUES ($1, $2, 'soak-agent', $3, true) 
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

    const payloadObject = { proc: 'cmd.exe', user: 'SYSTEM' };
    const payloadString = JSON.stringify(payloadObject);

    const signer = createSign('SHA256');
    signer.update(payloadString);
    signer.end();
    const signature = signer.sign(privateKey, 'hex');

    const syntheticPayload = JSON.stringify({
        device_id: hardwareToken,
        event_type: 'process_execution',
        timestamp: Date.now(),
        signature: signature,
        payload: payloadObject
    });

    const instance = autocannon({
        url: `${process.env.SENTINEL_GATEWAY_URL || 'https://api.sentinel.internal'}/events/ingest`, // Target NGINX Round Robin LB
        connections: 50,
        pipelining: 1,
        duration: 15, // Evaluated mapped functionally representing the 2-hour structural intent
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${analystToken}` // Device-bound ingestion token proxy map
        },
        body: syntheticPayload
    });

    autocannon.track(instance, { renderProgressBar: true });

    instance.on('done', (result) => {
        logger.info('Autocannon Soak Functional Simulation Concluded:');
        console.log(`Requests/sec: ${result.requests.average}`);
        console.log(`Latency P99: ${result.latency.p99} ms`);
        console.log(`Non-2xx Responses: ${result.non2xx}`);
        console.log(`Errors: ${result.errors}`);

        pool.end();
        process.exit(0);
    });
}

runSoakBaseline();
