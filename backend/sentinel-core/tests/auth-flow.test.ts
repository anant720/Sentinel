import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase C: Authentication Flow Lifecycle', () => {
    let accessToken: string;
    let refreshToken: string;

    const testUser = {
        email: `auth-lifecycle-123@example.com`,
        password: 'SecurePassword123!',
        id: '22222222-2222-2222-2222-222222222222'
    };

    beforeAll(async () => {
        await fastify.ready();
        const bcrypt = await import('bcrypt');
        const hash = await bcrypt.hash(testUser.password, 10);
        await pool.query(
            `INSERT INTO users (id, email, password_hash, organization_id, role) 
             VALUES ($1, $2, $3, '00000000-0000-0000-0000-000000000000', 'admin') 
             ON CONFLICT (email) DO NOTHING`,
            [testUser.id, testUser.email, hash]
        );
    });

    afterAll(async () => {
        // Cleanup natively
        await pool.query(`DELETE FROM users WHERE email = $1`, [testUser.email]);
        await pool.end();
        await redisClient.quit();
        await fastify.close();
    });

    it('1. Fails on invalid password', async () => {
        const res = await fastify.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: testUser.email, password: 'WrongPassword' }
        });
        expect(res.statusCode).toBe(401);
    });

    it('2. Succeeds on valid credentials', async () => {
        const res = await fastify.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: testUser.email, password: testUser.password },
            headers: { 'x-forwarded-for': '203.0.113.1' }
        });
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.payload);
        expect(data).toHaveProperty('token');
        expect(data).toHaveProperty('refreshToken');

        accessToken = data.token;
        refreshToken = data.refreshToken;
    });

    it('3. Rejects tampered JWT payload', async () => {
        const fakeToken = accessToken + 'evil';
        const res = await fastify.inject({
            method: 'GET',
            url: '/devices', // Protected Route Let's assume
            headers: { 'Authorization': `Bearer ${fakeToken}` }
        });
        expect(res.statusCode).toBe(401); // Unauthorized cleanly natively
    });

    it('4. Successfully issues new session via valid Refresh Token', async () => {
        const res = await fastify.inject({
            method: 'POST',
            url: '/auth/refresh',
            payload: { refreshToken: refreshToken }
        });
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.payload);
        expect(data).toHaveProperty('token');
    });

    it('5. Rejects unknown refresh tokens', async () => {
        const res = await fastify.inject({
            method: 'POST',
            url: '/auth/refresh',
            payload: { refreshToken: 'invalid.token.data' }
        });
        expect(res.statusCode).toBe(401);
    });
});
