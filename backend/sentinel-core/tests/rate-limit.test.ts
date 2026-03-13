import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { connectRedis, redisClient } from '../src/lib/redis.js';

test('Rate Limit Bypass Burst Simulation', async (t) => {
    // 1. Establish dependencies natively
    await connectRedis();

    // 2. Setup minimal Fastify instance mimicking the exact login route architecture
    const app = Fastify({ trustProxy: true }); // Trust proxy strictly evaluates X-Forwarded-For

    // Explicitly configure rate limit identically to index.ts
    await app.register(rateLimit, {
        redis: redisClient,
        max: 5, // Tight test bound
        timeWindow: 60000,
        keyGenerator: (req) => `login:${req.ip}`,
        errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Too many login attempts. Try again later.'
        })
    });

    app.get('/auth/login', async (req, reply) => {
        return reply.send({ authenticated: true });
    });

    await app.ready();

    await t.test('Aggressively bursting above limit triggers 429 Too Many Requests strict architectural rejection', async () => {
        const attackerIp = '192.168.100.5';
        let status429Count = 0;

        // Fire 10 rapid synchronous injections simulating a burst login spray
        for (let i = 0; i < 10; i++) {
            const res = await app.inject({
                method: 'GET',
                url: '/auth/login',
                headers: { 'x-forwarded-for': attackerIp }
            });
            if (res.statusCode === 429) status429Count++;
        }

        // Configuration mapped max: 5, so remaining 5 must be officially blocked via Redis metrics natively
        assert.equal(status429Count, 5, 'Exactly 5 burst requests were structurally rejected at the boundary');
    });

    await t.test('Distributed IP Simulation bypasses specific localized blocks seamlessly shifting subnets', async () => {
        // Now attacker shifts IPs representing a distributed botnet
        const shiftedIp = '203.0.113.1';
        const res = await app.inject({
            method: 'GET',
            url: '/auth/login',
            headers: { 'x-forwarded-for': shiftedIp }
        });

        // Clean subnet gets fresh intrinsic Redis sliding window rate bucket
        assert.equal(res.statusCode, 200, 'Distributed IP shift successfully acquired fresh rate window natively');
    });

    t.after(async () => {
        await app.close();
        // Discard literal redis keys mapping to the test execution footprint
        const keys = await redisClient.keys('login:*');
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
        await redisClient.quit();
    });
});
