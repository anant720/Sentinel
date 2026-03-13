/**
 * src/middleware/apikey.middleware.ts
 * ──────────────────────────────────────
 * Machine-to-Machine authentication interceptor.
 * Validates the raw `sk_live_...` Bearer token mathematically against the database,
 * enforces potential local memory blocks, and strictly binds the `request.orgId`.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiKeyService } from '../services/apikey.service.js';
import { RateLimitService } from '../services/ratelimit.service.js';

export const apiKeyMiddleware = async (
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer sk_sentinel_')) {
        reply.code(401).send({ error: 'Unauthorized', message: 'Missing or malformed API Key. Expected Bearer sk_sentinel_...' });
        return; // Fastify hook stops execution on reply.send()
    }

    const rawKey = authHeader.substring(7); // Strip "Bearer "

    try {
        const record = await ApiKeyService.validateKey(rawKey);

        if (!record) {
            reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or revoked API Key' });
            return;
        }

        // Strongly bind the physical Organization ID directly to the request lifecycle
        // bypassing human JWT extraction entirely.
        request.orgId = record.organization_id;
        (request as any).apiKeyRecord = record;

        // ── Rate limiting: Redis token bucket per API key ──────────────────────
        const rateResult = await RateLimitService.checkApiKey(
            record.id,
            record.rate_limit_per_minute ?? 1000
        );

        // Set rate-limit headers on all responses (RFC 6585)
        reply.header('X-RateLimit-Limit', rateResult.limit);
        reply.header('X-RateLimit-Remaining', rateResult.remaining);
        reply.header('X-RateLimit-Reset', rateResult.resetInSeconds);

        if (!rateResult.allowed) {
            reply.header('Retry-After', rateResult.resetInSeconds);
            reply.code(429).send({
                error: 'Too Many Requests',
                message: `API key rate limit exceeded. Max ${rateResult.limit} requests/minute. Retry after ${rateResult.resetInSeconds}s.`
            });
            return;
        }

        // ── Rate limiting: Organization Monthly Event Quota ────────────────────
        const quotaResult = await RateLimitService.checkOrgMonthlyQuota(
            record.organization_id,
            record.monthly_event_quota ?? 0
        );

        if (!quotaResult.allowed) {
            reply.code(429).send({
                error: 'Too Many Requests',
                message: `Organization monthly event quota exceeded. Please upgrade your plan.`
            });
            return;
        }

    } catch (err) {
        request.log.error({ err }, 'API Key execution failed cryptographically');
        reply.code(500).send({ error: 'Internal Server Error' });
    }
};
