import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase H: Extreme Fuzz Testing', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    it('Maintains 100% stability against mutated payload structures across 100 iterations', async () => {
        const endpoint = '/auth/login';

        for (let i = 0; i < 100; i++) {
            const fuzzedPayload: any = {};

            // Randomly insert garbage types
            if (Math.random() > 0.5) fuzzedPayload.email = { $ne: null }; // NoSQLi style object injection
            if (Math.random() > 0.5) fuzzedPayload.password = Array(100).fill('garbage');
            if (Math.random() > 0.8) fuzzedPayload['\u0000'] = 'null byte key';
            if (Math.random() > 0.5) fuzzedPayload.nested = { deep: { attack: true } };

            const response = await fastify.inject({
                method: 'POST',
                url: endpoint,
                payload: fuzzedPayload,
            });

            // The absolute vital metric: Fastify should NEVER crash and NEVER return a systemic 500 error.
            // Expected validations: 400 (Zod failure), 401 (Auth failure on bad shape), 415/422 etc.
            expect(response.statusCode).not.toBe(500);
            expect(response.statusCode).not.toBe(503);
        }
    });

    it('Gracefully drops malformed raw Content-Type streams', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/auth/login',
            payload: 'this is just raw string data not json',
            headers: { 'Content-Type': 'application/json' },
        });

        // Fastify should throw a default 400 bad request securely.
        expect(response.statusCode).toBe(400);
    });
});
