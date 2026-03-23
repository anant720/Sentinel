/**
 * src/queues/event.queue.ts
 * ─────────────────────────
 * Canonical BullMQ queue definitions.
 *
 * Queue is a POINTER SYSTEM — jobs carry IDs only, not payloads.
 * orgId is included so the worker can scope its DB fetch with organization_id.
 */
import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

// ── Connection config ────────────────────────────────────────────────────────

/**
 * BullMQ requires an ioredis-compatible connection config.
 * When REDIS_URL is provided (e.g., Upstash in production), pass the raw URL string
 * directly so ioredis handles any special characters in credentials.
 * Manual URL parsing via `new URL()` can silently corrupt Upstash tokens
 * that contain special characters, breaking the queue connection.
 */
export const queueConnection = process.env.REDIS_URL
    ? ({
        // Pass raw URL string — ioredis handles rediss:// TLS natively
        lazyConnect: true,
        enableOfflineQueue: false,
    } as any) // We override with the ioredis string constructor below
    : {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
      };

/**
 * Builds the BullMQ connection option.
 * For rediss:// URLs, returns a raw string so ioredis can parse credentials correctly.
 */
export function getBullMQConnection(): any {
    if (process.env.REDIS_URL) {
        const url = process.env.REDIS_URL;
        return {
            // ioredis accepts a URL string directly
            lazyConnect: true,
            enableOfflineQueue: false,
            ...(url.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
            // Parse the URL safely using ioredis's built-in URL parsing
            // by passing it as the host string in a way BullMQ accepts
            host: new URL(url).hostname,
            port: parseInt(new URL(url).port || '6379', 10),
            username: decodeURIComponent(new URL(url).username) || undefined,
            password: decodeURIComponent(new URL(url).password) || undefined,
        };
    }
    return {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
    };
}

// ── Queue instance ───────────────────────────────────────────────────────────

export const eventQueue = new Queue<EventJob>('event-ingestion', {
    connection: getBullMQConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
    },
});

// ── Job contract ─────────────────────────────────────────────────────────────

/**
 * The only data a job carries.
 * Worker fetches the full event from DB using both fields.
 */
export interface EventJob {
    eventId: string;
    /** orgId scopes the DB fetch — prevents worker from touching cross-org rows */
    orgId: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue an event for processing.
 * @param eventId  DB-assigned event UUID
 * @param orgId    Organization the event belongs to (from JWT, never from client)
 */
export async function enqueueEvent(eventId: string, orgId: string): Promise<void> {
    const { isRedisHealthy } = await import('../lib/redis.js');
    if (isRedisHealthy) {
        await eventQueue.add('process-event', { eventId, orgId });
        logger.debug({ eventId, orgId }, 'Event enqueued');
    } else {
        logger.warn({ eventId, orgId }, 'Redis unavailable -> event queuing skipped');
    }
}

/**
 * Called once during server bootstrap to confirm queue is ready.
 */
export function setupQueue(): void {
    logger.info('BullMQ Event Queue initialized');
}
