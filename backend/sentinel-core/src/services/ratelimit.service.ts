/**
 * src/services/ratelimit.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Redis sliding-window rate limiter for API keys.
 *
 * Algorithm: Fixed-window counter using Redis INCR + EXPIRE.
 * - Key: `ratelimit:apikey:<keyId>` with a 60-second TTL
 * - On every request: INCR the counter
 * - If count === 1, set EXPIRE to 60s (new window)
 * - If count > limit → return 429
 *
 * Also supports burst: burst = 20% headroom above the per-minute limit.
 */
import { redisClient } from '../lib/redis.js';
import { MetricsService } from './metrics.service.js';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetInSeconds: number;
}

export class RateLimitService {
    /**
     * Check and increment the rate limit counter for an API key.
     * @param keyId - The API key UUID (used as part of the Redis key)
     * @param limitPerMinute - limit stored on the api_keys record
     * @param burstMultiplier - e.g. 1.2 = 20% burst headroom
     */
    static async checkApiKey(
        keyId: string,
        limitPerMinute: number,
        burstMultiplier = 1.2
    ): Promise<RateLimitResult> {
        const effectiveLimit = Math.floor(limitPerMinute * burstMultiplier);
        const redisKey = `ratelimit:apikey:${keyId}`;

        // Lua script for atomic INCR + EXPIRE (prevents race conditions)
        const luaScript = `
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then
                redis.call('EXPIRE', KEYS[1], 60)
            end
            return {count, redis.call('TTL', KEYS[1])}
        `;

        const [count, ttl] = await redisClient.eval(
            luaScript,
            1,
            redisKey
        ) as [number, number];

        const remaining = Math.max(0, effectiveLimit - count);
        const allowed = count <= effectiveLimit;

        if (!allowed) {
            // Increment the rate_limit_hits_total Prometheus counter
            MetricsService.rateLimitTriggers.labels('api_key_ingest', keyId).inc();
        }

        return {
            allowed,
            remaining,
            limit: effectiveLimit,
            resetInSeconds: ttl > 0 ? ttl : 60,
        };
    }

    /**
     * Check monthly event quota for an organization.
     * @param orgId - Organization UUID
     * @param monthlyQuota - max events for this org this calendar month (0 = unlimited)
     */
    static async checkOrgMonthlyQuota(orgId: string, monthlyQuota: number): Promise<{ allowed: boolean; used: number }> {
        if (monthlyQuota <= 0) return { allowed: true, used: 0 };

        const now = new Date();
        const monthKey = `quota:org:${orgId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const used = await redisClient.incr(monthKey);

        // Set TTL to expire at end of month (approx 32 days to be safe)
        if (used === 1) {
            await redisClient.expire(monthKey, 32 * 24 * 60 * 60);
        }

        return {
            allowed: used <= monthlyQuota,
            used,
        };
    }
}
