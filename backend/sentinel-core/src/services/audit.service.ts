import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';

export interface AuditLogEntry {
    organization_id?: string;
    user_id?: string;
    action: string;
    resource_type?: string;
    resource_id?: string;
    metadata?: any;
    ip_address?: string;
}

export class AuditService {
    static async log(entry: AuditLogEntry) {
        const query = `
      INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

        try {
            await db.query(query, [
                entry.organization_id,
                entry.user_id,
                entry.action,
                entry.resource_type,
                entry.resource_id,
                entry.metadata,
                entry.ip_address
            ]);

            // Broadcast management event to Redis for real-time portals
            const { BroadcastService, MANAGEMENT_EVENT_CHANNEL } = await import('./broadcast.service.js');
            await BroadcastService.publishManagement({
                id: Math.random().toString(36).substring(7), // Brief ID for broadcast instance
                type: `audit.${entry.action}`,
                timestamp: Date.now(),
                organization_id: entry.organization_id,
                payload: {
                    action: entry.action,
                    resource_type: entry.resource_type,
                    resource_id: entry.resource_id,
                    user_id: entry.user_id,
                    metadata: entry.metadata,
                    ip_address: entry.ip_address
                }
            });
        } catch (err) {
            logger.error('Failed to write audit log', err);
            // Don't throw - audit logging shouldn't crash the main flow
        }
    }
}
