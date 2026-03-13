import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase B: API Contract Validation', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    const endpoint = '/auth/login';

    it('1. Rejects malformed JSON payload (400)', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: '{ invalidJson: true, ', // Syntax error
            headers: { 'Content-Type': 'application/json' },
        });
        expect(response.statusCode).toBe(400); // Bad Request implicitly
    });

    it('2. Rejects missing required fields (400)', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: 'test@example.com' }, // Missing password
        });
        expect(response.statusCode).toBe(400);
    });

    it('3. Ignores or rejects unexpected extra fields safely', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: {
                email: 'fake@example.com',
                password: 'password123',
                isAdmin: true,       // Attack vector attempt
                role: 'superuser'
            },
        });
        // We expect it to either 401 (Auth Failed) or 400 (if strict zod), but NOT crash (500)
        expect(response.statusCode).not.toBe(500);
        expect([400, 401]).toContain(response.statusCode);
    });

    it('4. Rejects wrong data types (400)', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: 12345, password: ['foo'] },
        });
        expect(response.statusCode).toBe(400);
    });

    it('5. Rejects extremely large payload (>10kb body limit) (413)', async () => {
        const massiveString = 'A'.repeat(15000); // 15kb
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: 'fake@example.com', password: massiveString },
        });
        expect(response.statusCode).toBe(413); // Payload Too Large
    });

    it('6. Escapes and rejects SQL injection strings safely', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: "' OR 1=1 --", password: "' OR '1'='1" },
        });
        expect(response.statusCode).toBe(401); // Auth failed, no DB exception, no 500
    });

    it('7. Escapes and rejects XSS payloads safely', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: "<script>alert('xss')</script>@evil.com", password: "password123" },
        });
        expect([400, 401]).toContain(response.statusCode);
    });

    it('8. Validates Unicode / Null Byte injection securely', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: endpoint,
            payload: { email: "admin\u0000@evil.com", password: "password123" },
        });
        expect([400, 401, 404]).toContain(response.statusCode);
    });
});
