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
        } catch (err) {
            logger.error('Failed to write audit log', err);
            // Don't throw - audit logging shouldn't crash the main flow
        }
    }
}
