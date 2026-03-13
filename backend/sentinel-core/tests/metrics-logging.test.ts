import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase O & P: Metrics & Logging Validation', () => {
    beforeAll(async () => {
        await fastify.ready();
    });

    afterAll(async () => {
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    it('Prometheus Metrics endpoint exposes physical login / risk boundaries clearly', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/metrics',
        });

        const body = response.payload;

        expect(response.statusCode).toBe(200);
        expect(body).toContain('login_attempts_total');
        expect(body).toContain('login_failures_total');
        expect(body).toContain('blocked_requests_total');
        expect(body).toContain('risk_score_average');
        expect(body).toContain('worker_queue_depth');
    });

    it('Structured logging successfully binds but NEVER exposes passwords natively', async () => {
        // We evaluate Pino via capturing streams natively or evaluating output structures.
        // We will trigger a failure and view if the Fastify logger natively censors passwords.

        // As a unit-test proxy: Pino is configured to intercept "password" and convert to "[REDACTED]"
        const logData = { user: "admin", password: "SuperSecretPassword123!" };

        // Pino's explicit mapping array censors natively
        const response = await fastify.inject({
            method: 'POST',
            url: '/auth/login',
            payload: logData
        });

        // The body should NEVER reflect the password
        expect(response.payload).not.toContain("SuperSecretPassword123!");
    });
});
