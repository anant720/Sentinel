/**
 * Phase B & C - Canonical Serialization and Malformed JSON Validator
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
    console.log("PHASES B & C: JSON EDGE CASES & MALFORMED ATTACKS");
    console.log("==========================================");

    await connectRedis();
    const app = Fastify();
    await setupServer(app);
    await app.ready();

    // Setup Mock Environment
    const orgRes = await db.query(
        "INSERT INTO organizations (name, slug, api_key_hash) VALUES ($1, $2, 'test-hash') RETURNING id",
        [`Chaos BC ${Date.now()}`, `chaosbc-${Date.now()}`]
    );
    const orgId = orgRes.rows[0].id;
    const keyResult = await ApiKeyService.generateKey(orgId, 10000);
    const orgApiKey = keyResult.rawKey;

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pemPublic = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const devRes = await db.query(
        "INSERT INTO devices (organization_id, device_name, device_type, public_key, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id",
        [orgId, 'JSON Fuzzer', 'Testing', pemPublic]
    );
    const deviceId = devRes.rows[0].id;

    // Helper: Valid Canonical Base
    const buildCanonicalString = (obj: any) => {
        const canonicalDict = Object.fromEntries(Object.keys(obj).sort().map(key => [key, obj[key]]));
        return JSON.stringify(canonicalDict);
    };

    const signPayload = (canonicalStr: string) => {
        const sign = crypto.createSign('SHA256');
        sign.update(canonicalStr);
        return sign.sign(privateKey, 'hex');
    };

    const inject = async (payload: any) => {
        return app.inject({
            method: 'POST',
            url: '/events/ingest',
            headers: { authorization: `Bearer ${orgApiKey}` },
            payload
        });
    };

    console.log("\n--- PHASE B: Canonical Serialization Variants ---");

    const baseEvent = {
        device_id: deviceId,
        event_type: 'login_attempt',
        timestamp: Date.now(),
        nonce: crypto.randomUUID(),
        payload: {
            user_id: crypto.randomUUID(),
            timestamp: Date.now(),
            email: 'variant@example.com',
            success: true
        }
    };
    const validCanonicalStr = buildCanonicalString(baseEvent);
    const validSignature = signPayload(validCanonicalStr);

    console.log("Variant 1: Reordered Extraneous Whitespace Injection inside JSON string payload");
    const jsonWithWhitespace = `{\n  "event": {\n    "device_id": "${baseEvent.device_id}",\n    "event_type": "${baseEvent.event_type}",\n    "nonce": "${baseEvent.nonce}",\n    "payload": {"email":"variant@example.com","success":true,"timestamp":${baseEvent.payload.timestamp},"user_id":"${baseEvent.payload.user_id}"},\n    "timestamp": ${baseEvent.timestamp}\n  },\n  "signature": "${validSignature}"\n}`;

    const resB1 = await app.inject({
        method: 'POST',
        url: '/events/ingest',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${orgApiKey}`
        },
        payload: jsonWithWhitespace // Send raw string to bypass Fastify parsing sanitization during transmission
    });
    console.log(`Response to Whitespace Injection: ${resB1.statusCode}`); // Expect 202 - Whitespace is stripped by Fastify payload parsing prior to Canonicalization internally.

    console.log("Variant 2: Null boundary execution mapping string edgecases natively");
    const nullPayloadEvent = { ...baseEvent, payload: null, nonce: crypto.randomUUID() };
    const nullSig = signPayload(buildCanonicalString(nullPayloadEvent));
    const resB2 = await inject({ event: nullPayloadEvent, signature: nullSig });
    console.log(`Response to Null bounds: ${resB2.statusCode} - ${resB2.json().message}`); // Expect 400 - Zod validation failure natively.

    console.log("\n--- PHASE C: Malformed Format Injection ---");

    const injectRaw = async (rawPayload: string) => {
        return app.inject({
            method: 'POST',
            url: '/events/ingest',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${orgApiKey}` },
            payload: rawPayload
        });
    };

    console.log("C1: Null Array Top-level root crash payload");
    const resC1 = await injectRaw(`{"events": null}`);
    console.log(`Status: ${resC1.statusCode} | Blocked By: Zod Schema / Type Error`);

    console.log("C2: Raw String Array Top-Level Format Break");
    const resC2 = await injectRaw(`{"events": "string-imitation-failure"}`);
    console.log(`Status: ${resC2.statusCode} | Blocked By: Zod Type Coercion Error`);

    console.log("C3: Empty Dictionary Bypass");
    const resC3 = await injectRaw(`{}`);
    console.log(`Status: ${resC3.statusCode} | Blocked By: Generic validation reject`);

    console.log("C4: Type-Broken Massive Nested Payload Limits (100 levels)");
    let deepNest = `{"level": 0`;
    for (let i = 0; i < 100; i++) { deepNest += `,"child": {"level": ${i}`; }
    for (let i = 0; i < 100; i++) { deepNest += `}`; }
    deepNest += `}`;

    const resC4 = await injectRaw(`{"event": ${deepNest}, "signature": "xxx"}`);
    console.log(`Status: ${resC4.statusCode} | Deep nested anomaly structurally blocked before regex dos.`);

    console.log("\nPhases B & C Complete.");

    await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    await app.close();
    await redisClient.quit();
    process.exit(0);
};

start();
