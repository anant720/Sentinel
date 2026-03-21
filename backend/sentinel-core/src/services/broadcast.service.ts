import { redisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export const SECURITY_EVENT_CHANNEL = 'security_events';
export const MANAGEMENT_EVENT_CHANNEL = 'management_events';

export interface BroadcastEvent {
    id: string;
    type: string;
    timestamp: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    risk_score?: number;
    payload: any;
    organization_id?: string | undefined;
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
     */
    async publish(event: BroadcastEvent): Promise<void> {
        return this._publish(SECURITY_EVENT_CHANNEL, event);
    },

    /**
     * Publishes a management/audit event to the Redis channel.
     */
    async publishManagement(event: BroadcastEvent): Promise<void> {
        return this._publish(MANAGEMENT_EVENT_CHANNEL, event);
    },

    async _publish(channel: string, event: BroadcastEvent): Promise<void> {
        try {
            const { isRedisHealthy } = await import('../lib/redis.js');
            if (!isRedisHealthy) {
                logger.warn({ eventId: event.id, channel }, 'Redis unavailable -> event broadcast skipped');
                return;
            }
            const message = JSON.stringify(event);
            await redisClient.publish(channel, message);
            logger.debug({ eventId: event.id, type: event.type, channel }, 'Event published to Redis Pub/Sub');
        } catch (err: any) {
            logger.error({ err: err.message, eventId: event.id, channel }, 'Failed to publish event to Redis');
        }
    }
};
