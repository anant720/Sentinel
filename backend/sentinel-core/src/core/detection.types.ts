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
    // DB-level geo and IP columns (populated by auth controller and HTTP hook)
    ip_address?: string | null;
    geo_country?: string | null;
    geo_country_code?: string | null;
    geo_city?: string | null;
    geo_lat?: number | null;
    geo_lon?: number | null;
}

import { Redis } from 'ioredis';

export interface DetectionContext {
    orgId: string;
    event: EventRecord;
    config?: Record<string, any>;
    redis: Redis;
}

export interface ModuleConfigField {
    key: string;
    label: string;
    default: number;
    min?: number;
    max?: number;
}

export interface ModuleMetadata {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: 'identity' | 'network' | 'behavioral' | 'infrastructure';
    configFields: ModuleConfigField[];
    subscribedEvents: string[];
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
     * Optional: return rich metadata for the module registry API.
     * If implemented, this module will automatically appear on the
     * Detection Logic configuration page in the frontend.
     */
    metadata?(): ModuleMetadata;

    /**
     * Execute detection logic.
     * Must be idempotent.
     * Must never throw uncaught errors.
     */
    execute(context: DetectionContext): Promise<void>;
}
