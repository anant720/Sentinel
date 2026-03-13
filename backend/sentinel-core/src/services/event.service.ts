import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { enqueueEvent } from '../queues/event.queue.js';
import { computeIntegrityHash } from '../security/index.js';

export interface InternalEventPayload {
    organization_id: string;
    event_type: string;
    payload: Record<string, any>;
}

export class EventService {
    /**
     * Publishes an internal system event (bypassing strictly typed HTTP ingestion).
     * Automatically hashes payload for integrity, stamps it as SYSTEM, and places it into the execution Queue.
     */
    static async publish(data: InternalEventPayload) {
        const timestamp = Date.now();
        const hashInput = `INTERNAL:${data.event_type}:${timestamp}:${JSON.stringify(data.payload)}`;
        const integrityHash = computeIntegrityHash(hashInput);

        const result = await db.query(
            `INSERT INTO events
                 (organization_id, device_id, event_type, payload, signature, integrity_hash, processed)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             RETURNING id, created_at`,
            [data.organization_id, null, data.event_type, data.payload, 'SYSTEM_INTERNAL', integrityHash],
        );

        const stored = result.rows[0];

        logger.debug(
            { eventId: stored.id, orgId: data.organization_id, event_type: data.event_type },
            'Internal Event persisted',
        );

        await enqueueEvent(stored.id, data.organization_id);

        return stored;
    }
}
