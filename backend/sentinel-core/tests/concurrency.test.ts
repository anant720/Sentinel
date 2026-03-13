import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase I: Concurrency & Race Conditions', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    it('Safely absorbs 1,000 parallel login attempts structurally without dropping the Node event loop (500)', async () => {
        const promises = [];
        const THREAD_COUNT = 1000;

        for (let i = 0; i < THREAD_COUNT; i++) {
            promises.push(
                fastify.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: `concurrent-bot-${i}@evasion.com`, password: 'password123' },
                })
            );
        }

        const results = await Promise.all(promises);

        let error500s = 0;
        let rateLimited429s = 0;

        for (const res of results) {
            if (res.statusCode === 500) error500s++;
            if (res.statusCode === 429) rateLimited429s++;
            if (res.statusCode === 503) error500s++;
        }

        // Expected Target: Zero uncaught exceptions. Concurrency limit blocks cleanly.
        expect(error500s).toBe(0);
        // Ensure Redis rate limit correctly activates natively under extreme parallel burst
        expect(rateLimited429s).toBeGreaterThan(0);
    });
});
