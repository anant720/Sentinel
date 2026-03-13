import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';

export class NotificationService {
    static async create(orgId: string, alertId: string) {
        try {
            const result = await db.query(
                `INSERT INTO notifications (organization_id, alert_id) VALUES ($1, $2) RETURNING *`,
                [orgId, alertId]
            );
            return result.rows[0];
        } catch (error: any) {
            logger.error({ error, orgId, alertId }, 'Failed to create notification');
            throw error;
        }
    }

    static async getNotifications(orgId: string, limit = 50) {
        const result = await db.query(
            `SELECT n.id, n.is_read, n.created_at, n.alert_id, 
                    a.type, a.severity, a.title, a.description, a.entity
             FROM notifications n
             JOIN alerts a ON n.alert_id = a.id
             WHERE n.organization_id = $1
             ORDER BY n.created_at DESC
             LIMIT $2`,
            [orgId, limit]
        );
        return result.rows;
    }

    static async markAsRead(orgId: string, notificationId: string) {
        const result = await db.query(
            `UPDATE notifications SET is_read = true WHERE id = $1 AND organization_id = $2 RETURNING *`,
            [notificationId, orgId]
        );
        return result.rows[0];
    }

    static async clearAll(orgId: string) {
        const result = await db.query(
            `DELETE FROM notifications WHERE organization_id = $1 RETURNING *`,
            [orgId]
        );
        return result.rowCount;
    }
}
