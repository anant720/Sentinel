import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';

// We mock the exact signature map config strategy used in jwt.ts
const JWT_SECRETS_MAP: Record<string, string> = {
    'v1': 'old-secret-key-32-chars-long-xxx1',
    'v2': 'new-secret-key-32-chars-long-xxx2'
};

const getDynamicJwtConfig = () => ({
    secret: (request: any, payload: any, cb: (err: Error | null, secret?: string) => void) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader) return cb(new Error('Missing authorization header'));
            const tokenStr = authHeader.replace('Bearer ', '');
            const decoded: any = request.server.jwt.decode(tokenStr, { complete: true });

            const kid = decoded?.header?.kid || 'default';
            const secret = JWT_SECRETS_MAP[kid];
            if (!secret) return cb(new Error(`Invalid key ID (kid): ${kid}`));
            return cb(null, secret);
        } catch (e: any) {
            return cb(e);
        }
    }
});

test('Cryptographic JWT Key Rollover (Zero Downtime)', async (t) => {
    const app = Fastify();
    await app.register(fastifyJwt, getDynamicJwtConfig());

    app.get('/verify', async (request, reply) => {
        try {
            await request.jwtVerify();
            return { userId: (request.user as any).userId };
        } catch (err: any) {
            return reply.code(401).send({ error: err.message });
        }
    });

    await app.ready();

    let legacyToken = '';
    let modernToken = '';

    await t.test('Securely signs distinct payload generations natively binding strict `kid` mappings dynamically overriding the default signature loop.', async () => {
        // Sign V1 mathematically independently
        legacyToken = app.jwt.sign({ userId: 'u1' }, {
            header: { kid: 'v1', alg: 'HS256' },
            key: JWT_SECRETS_MAP['v1']
        });

        // Sign V2 independently
        modernToken = app.jwt.sign({ userId: 'u2' }, {
            header: { kid: 'v2', alg: 'HS256' },
            key: JWT_SECRETS_MAP['v2']
        });

        assert.ok(legacyToken !== modernToken, 'Signatures structurally resolve to strictly distinct outputs natively.');
    });

    await t.test('Verification dynamically leverages header mappings allowing independent evaluation of mathematically separated keys simultaneously.', async () => {
        // V1 payload rigorously evaluates true via HTTP pipeline
        const v1Res = await app.inject({ method: 'GET', url: '/verify', headers: { authorization: `Bearer ${legacyToken}` } });
        assert.equal(v1Res.statusCode, 200, 'Legacy token structurally survived decoding');
        assert.equal(v1Res.json().userId, 'u1');

        // V2 payload securely decodes via HTTP pipeline
        const v2Res = await app.inject({ method: 'GET', url: '/verify', headers: { authorization: `Bearer ${modernToken}` } });
        assert.equal(v2Res.statusCode, 200, 'Modern token structurally survived decoding');
        assert.equal(v2Res.json().userId, 'u2');

        // Fails safely if kid doesn't exist
        const badToken = app.jwt.sign({ user: 'hacker' }, { header: { kid: 'v3', alg: 'HS256' }, key: 'some-fake-key-injection' });
        const badRes = await app.inject({ method: 'GET', url: '/verify', headers: { authorization: `Bearer ${badToken}` } });
        assert.equal(badRes.statusCode, 401, 'Safely blocked missing configuration signatures geometrically.');
    });

    t.after(async () => {
        await app.close();
    });
});
