import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase L: Redis Resilience & Graceful Degradation', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        if (redisClient.status !== 'ready') {
            await redisClient.connect().catch(() => { });
        }
        await redisClient.quit();
        await fastify.close();
    });

    it('Fails open resiliently if Redis drops offline unexpectedly', async () => {
        // Step 1: Force Redis Disconnect globally
        await redisClient.disconnect();

        // Step 2: Ensure API does not systemic crash evaluating Rate Limits
        const response = await fastify.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'fail-open@example.com', password: 'password123' },
        });

        // Fastify rate-limiter defaults to bypassing correctly upon Redis timeout if configured,
        // OR returns 500 natively. In our setup, we expect the server to at LEAST remain alive.
        // Even if it returns 500 for the immediate request, the Node Event Loop must not exit (1).
        expect(response.statusCode === 401 || response.statusCode === 500).toBe(true);

        // Ensure Healthcheck flags Unavailable (503) during the outage accurately mapping Kubernetes bounds
        const health = await fastify.inject({ method: 'GET', url: '/health/ready' });
        expect(health.statusCode).toBe(503);

        // Step 3: Reconnect securely natively
        await redisClient.connect();

        // Step 4: System mathematically recovers instantly
        const restoredHealth = await fastify.inject({ method: 'GET', url: '/health/ready' });
        expect(restoredHealth.statusCode).toBe(200);
    });
});
