import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/database.js';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { authMiddleware } from '../src/middleware/auth.middleware.js';
import { orgIsolationMiddleware } from '../src/middleware/org-isolation.middleware.js';
import { AlertService } from '../src/services/alert.service.js';

test('Multi-Tenant Isolation Attacks', async (t) => {
    // 1. Setup Live Data Boundary
    const orgARes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Victim Org', 'vic-org', 'vic-hash') RETURNING id");
    const orgAId = orgARes.rows[0].id;

    const orgBRes = await db.query("INSERT INTO organizations (name, slug, api_key_hash) VALUES ('Attacker Org', 'att-org', 'att-hash') RETURNING id");
    const orgBId = orgBRes.rows[0].id;

    const userARes = await db.query("INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, 'a@vic.com', 'hash', 'admin') RETURNING id", [orgAId]);
    const userAId = userARes.rows[0].id;

    await t.test('Manual Query Injection: Attempting to query or mutate an alert from another organization strictly fails due to Org ID scopes', async () => {
        // Insert a real restricted alert in Org A
        const alertRes = await db.query(
            "INSERT INTO alerts (organization_id, type, severity, title, description, fingerprint, status) VALUES ($1, 'test_alert', 'high', 'Confidential', 'Data', 'fingerprint1', 'OPEN') RETURNING id",
            [orgAId]
        );
        const victimAlertId = alertRes.rows[0].id;

        // Attacker evaluates data using their own Context (Org B) but asks for Victim's Alert ID
        // The service layer must explicitly enforce org isolation, rendering it 404/Empty.

        try {
            await AlertService.transitionStatus(orgBId, victimAlertId, 'RESOLVED', userAId, 'Hacked');
            assert.fail('Should have been mechanically rejected by the cross-tenant boundary query');
        } catch (err: any) {
            assert.ok(err.message.includes('not found'), `Strict Isolation prevented access: ${err.message}`);
        }

        const attackerAlerts = await AlertService.getAlerts(orgBId, 50);
        assert.equal(attackerAlerts.length, 0, 'Attacker should see 0 alerts from the victim tenant');
    });

    await t.test('Org Context Tampering: Modifying the organization_id in a signed JWT payload triggers an explicit Signature Validation abortion', async () => {
        const app = Fastify();
        app.register(fastifyJwt, { secret: 'super-secret-system-key' });

        // Generate a 100% valid JWT describing Org A
        const validPayload = { user_id: userAId, organization_id: orgAId, role: 'admin' };

        let validToken = '';
        app.get('/sign', async (request, reply) => {
            validToken = await reply.jwtSign(validPayload);
            return reply.send({ token: validToken });
        });

        // The forged token will be dynamically attached in the preValidation hook, but the route must be defined now.
        let forgedTokenToTest = '';
        app.get('/test', {
            preValidation: [async (req, reply) => {
                req.headers.authorization = `Bearer ${forgedTokenToTest}`;
                try {
                    await authMiddleware(req, reply);
                } catch (err: any) {
                    throw err;
                }
            }]
        }, async (req, reply) => {
            return reply.send({ ok: true });
        });

        // Initialize mock server to actually get the `reply.jwtSign` instance
        await app.inject({ method: 'GET', url: '/sign' });

        // Forge the JWT: Explode the parts, decode the payload, change OrgA -> OrgB, re-encode
        const [header, payloadObj, signature] = validToken.split('.');
        const decodedPayload = JSON.parse(Buffer.from(payloadObj, 'base64').toString('utf8'));

        // Attacker tampering attempt: Assign their own Organization Context to bypass controls
        decodedPayload.organization_id = orgBId;
        const forgedPayloadStr = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');

        forgedTokenToTest = `${header}.${forgedPayloadStr}.${signature}`;

        const response = await app.inject({ method: 'GET', url: '/test' });

        // Native Verification blocks it
        assert.equal(response.statusCode, 401, 'Fastify correctly rejected the forged payload due to invalid signature');
        const body = JSON.parse(response.payload);
        assert.equal(body.error, 'Unauthorized');

        await app.close();
    });

    t.after(async () => {
        await db.query("DELETE FROM organizations WHERE id IN ($1, $2)", [orgAId, orgBId]);
    });
});
