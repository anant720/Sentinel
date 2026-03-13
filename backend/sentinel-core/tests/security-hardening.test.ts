import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase N: Security Hardening Headers', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    it('Enforces strict security headers (Helmet, XSS, Frame Options)', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/health/live', // Test public endpoint natively
        });

        const headers = response.headers;
        expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['x-xss-protection']).toBe('1; mode=block');
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['content-security-policy']).toBeDefined();
    });

    it('Enforces strict OWASP cache poisoning headers globally', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/health/live',
        });

        const headers = response.headers;
        expect(headers['cache-control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
        expect(headers['pragma']).toBe('no-cache');
    });

    it('Bounces explicitly invalid CORS domains securely', async () => {
        const response = await fastify.inject({
            method: 'OPTIONS',
            url: '/auth/login',
            headers: { 'Origin': 'https://evil-phishing-site.com', 'Access-Control-Request-Method': 'POST' },
        });

        // Fastify CORS should securely deny or omit Access-Control-Allow-Origin headers
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});
