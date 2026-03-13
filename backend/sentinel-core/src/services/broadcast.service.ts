import { redisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export const SECURITY_EVENT_CHANNEL = 'security_events';

export interface BroadcastEvent {
    id: string;
    type: string;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    payload: any;
}

/**
 * BroadcastService
 * ────────────────
 * Standardized interface for cross-process real-time event broadcasting
 * using Redis Pub/Sub.
 */
export const BroadcastService = {
    /**
     * Publishes a security event to the Redis channel.
     * This can be called from background workers, the detection engine, or simulation scripts.
     */
    async publish(event: BroadcastEvent): Promise<void> {
        try {
            const message = JSON.stringify(event);
            await redisClient.publish(SECURITY_EVENT_CHANNEL, message);
            logger.debug({ eventId: event.id, type: event.type }, 'Security event published to Redis Pub/Sub');
        } catch (err: any) {
            logger.error({ err: err.message, eventId: event.id }, 'Failed to publish security event to Redis');
        }
    }
};
