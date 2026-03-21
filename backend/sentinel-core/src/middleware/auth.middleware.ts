/**
 * src/middleware/auth.middleware.ts
 * ──────────────────────────────────
 * JWT verification middleware.
 *
 * PATTERN:
 *  1. request.jwtVerify() — cryptographic verification by @fastify/jwt
 *  2. validateTokenPayload() — structural validation of decoded claims
 *  3. request.user is set to the validated, typed AccessTokenPayload
 *
 * Middleware never trusts the decoded object blindly.
 * Malformed payloads (missing claims) are rejected with 401 here.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { AccessTokenPayload, validateTokenPayload } from '../security/index.js';

// Re-export so other files that need the type don't bypass security layer
export type { AccessTokenPayload as JWTPayload };

export const authMiddleware = async (
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> => {
    try {
        // Step 1: Cryptographic verification — signature + expiry
        await request.jwtVerify();

        // Step 2: Structural validation — confirm all required claims are present
        const validated = validateTokenPayload(request.user);

        // Step 3: Revocation Check — check Redis for blacklisted JTI
        const { redisClient, isRedisHealthy } = await import('../lib/redis.js');

        if (!isRedisHealthy) {
            return reply.status(503).send({
                error: 'Service Unavailable',
                message: 'Authentication security service is temporarily unavailable.'
            });
        }

        const isRevoked = await redisClient.get(`revoked:${validated.jti}`);
        if (isRevoked) {
            throw new Error('Token has been revoked');
        }

        // Step 4: Replace request.user with the strictly-typed, validated payload
        request.user = validated;

        // Step 5: Non-blocking presence update
        if (validated.user_id) {
            import('../lib/database.js').then(({ db }) => {
                db.query(
                    `UPDATE users SET last_seen_at = NOW() WHERE id = $1`,
                    [validated.user_id]
                ).catch(() => { /* non-blocking, ignore errors */ });
            }).catch(() => { /* ignore import errors */ });
        }
    } catch (err: any) {
        const message = err.message?.includes('Malformed JWT') 
            ? 'Malformed token payload' 
            : 'Missing or invalid token';
        reply.code(401).send({ error: 'Unauthorized', message });
    }
};
