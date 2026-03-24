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

        // Step 3.5: Zero Trust Continuous Session Binding (Token Hijacking Defense)
        const incomingFingerprint = request.headers['x-device-fingerprint'];
        const sealedFingerprint = (validated as any).device_id;
        
        console.log(`[ZERO TRUST] Header: ${incomingFingerprint} | Sealed Token: ${sealedFingerprint}`);

        if (sealedFingerprint && incomingFingerprint && sealedFingerprint !== incomingFingerprint) {
            try {
                // Instantly Revoke the Token across all nodes
                await redisClient.setex(`revoked:${validated.jti}`, 60 * 60 * 24 * 7, 'hijacked');

                // FIRE SECURITY ALERT IMMEDIATELY TO POSTGRESQL 
                const { AlertService } = await import('../services/alert.service.js');
                await AlertService.createAlert(validated.organization_id, {
                    eventId: `hijack-${Date.now()}`,
                    type: 'token_hijacking',
                    title: 'Token Hijacking Detected (Zero Trust)',
                    description: `A cryptographically valid session token was hijacked and utilized from an unauthorized device footprint. The session was instantly terminated globally.`,
                    severity: 'critical',
                    entity: validated.user_id,
                    evidence: {
                        expected_fingerprint: sealedFingerprint,
                        incoming_fingerprint: incomingFingerprint,
                        hijacked_ip: request.ip
                    },
                    metadata: { action: 'session_terminated', user_id: validated.user_id },
                    fingerprint: `token_hijack:${validated.user_id}:${Math.floor(Date.now() / 60000)}`
                });
            } catch (e) {
                request.log.error(e, 'Failed to log token hijack alert');
            }

            throw new Error('Token Hijacking Detected: Device fingerprint mismatch.');
        }

        // Step 3.6: Single Active Session Verification (Concurrent Session Limiting)
        const expectedSessionId = (validated as any).session_id;
        const currentActiveSession = await redisClient.get(`session:${validated.user_id}`);

        if (expectedSessionId && currentActiveSession && expectedSessionId !== currentActiveSession) {
            // Unconditionally revoke the superseded rogue token
            await redisClient.setex(`revoked:${validated.jti}`, 60 * 60 * 24 * 7, 'superseded');

            try {
                const { AlertService } = await import('../services/alert.service.js');
                await AlertService.createAlert(validated.organization_id, {
                    eventId: `concurrent-${Date.now()}`,
                    type: 'concurrent_session',
                    title: 'Concurrent Session Detected & Evicted',
                    description: `A user account attempted to maintain simultaneous active sessions across multiple isolated environments. The superseded session was instantly dropped globally.`,
                    severity: 'high',
                    entity: validated.user_id,
                    evidence: {
                        superseded_session: expectedSessionId,
                        active_session: currentActiveSession,
                        violating_ip: request.ip
                    },
                    metadata: { action: 'session_terminated', user_id: validated.user_id },
                    fingerprint: `concurrent_session:${validated.user_id}:${Math.floor(Date.now() / 60000)}`
                });
            } catch (e) {
                request.log.error(e, 'Failed to log concurrent session alert');
            }

            throw new Error('Concurrent Session Detected: Your account was logged into from another device. This session is permanently terminated.');
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
