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

export const queueConnection = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
};

// ── Queue instance ───────────────────────────────────────────────────────────

export const eventQueue = new Queue<EventJob>('event-ingestion', {
    connection: queueConnection,
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
    await eventQueue.add('process-event', { eventId, orgId });
    logger.debug({ eventId, orgId }, 'Event enqueued');
}

/**
 * Called once during server bootstrap to confirm queue is ready.
 */
export function setupQueue(): void {
    logger.info('BullMQ Event Queue initialized');
}
