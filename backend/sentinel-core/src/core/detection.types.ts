export interface EventRecord {
    id: string;
    organization_id: string;
    device_id: string | null;
    event_type: string;
    payload: Record<string, any>;
    signature: string;
    integrity_hash: string;
    processed: boolean;
    created_at: Date;
    processed_at?: Date | null;
}

import { Redis } from 'ioredis';

export interface DetectionContext {
    orgId: string;
    event: EventRecord;
    config?: Record<string, any>;
    redis: Redis;
}

export interface DetectionModule {
    name: string;

    /**
     * Return list of event types this module subscribes to.
     * DetectionEngine uses this for dispatch filtering.
     * Return ['*'] to subscribe to all events.
     */
    subscribesTo(): string[];

    /**
     * Execute detection logic.
     * Must be idempotent.
     * Must never throw uncaught errors.
     */
    execute(context: DetectionContext): Promise<void>;
}
