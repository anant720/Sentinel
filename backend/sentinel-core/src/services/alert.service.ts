import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';

export interface AlertPayload {
    eventId?: string;
    type?: string;
    ruleId?: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
    entity?: string;
    evidence?: any;
    fingerprint: string;
}

export class AlertService {
    /**
     * Persist a new detection alert.
     * Pure persistence logic, no heuristics evaluated here.
     */
    static async createAlert(orgId: string, payload: AlertPayload) {
        try {
            const result = await db.query(
                `INSERT INTO alerts 
                    (organization_id, event_id, type, rule_id, severity, title, description, metadata, entity, evidence, fingerprint) 
                 VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                 ON CONFLICT (fingerprint) DO UPDATE 
                    SET suppression_count = alerts.suppression_count + 1 
                 RETURNING (xmax = 0) AS inserted_now, id, created_at, suppression_count`,
                [
                    orgId,
                    payload.eventId ?? null,
                    payload.type || payload.ruleId || 'detection_alert',
                    payload.ruleId || payload.type || null,
                    payload.severity,
                    payload.title,
                    payload.description,
                    payload.metadata ? JSON.stringify(payload.metadata) : null,
                    payload.entity || null,
                    payload.evidence ? JSON.stringify(payload.evidence) : null,
                    payload.fingerprint,
                ],
            );

            const row = result.rows[0];

            if (!row.inserted_now) {
                logger.debug(
                    { orgId, type: payload.type, fingerprint: payload.fingerprint, suppressionCount: row.suppression_count },
                    'Alert suppressed due to active uniqueness boundary (bumping suppression count)'
                );
                return null;
            }

            // [NEW] Trigger a dedicated notification for this new alert
            await NotificationService.create(orgId, row.id);

            return row;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Transition the state of an existing alert following strict finite-state rules.
     */
    static async transitionStatus(orgId: string, alertId: string, newStatus: string, actorId: string, note?: string) {
        const fetchResult = await db.query(
            'SELECT status FROM alerts WHERE id = $1 AND organization_id = $2',
            [alertId, orgId]
        );

        if (fetchResult.rows.length === 0) {
            throw new Error('Alert not found');
        }

        const currentStatus = fetchResult.rows[0].status;
        const validTransitions: Record<string, string[]> = {
            'OPEN': ['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'],
            'ACKNOWLEDGED': ['RESOLVED', 'DISMISSED'],
            'DISMISSED': ['RESOLVED'],     // Allow re-opening dismissed alerts as resolved
        };

        if (!validTransitions[currentStatus]?.includes(newStatus)) {
            throw new Error(`Invalid lifecycle transition from ${currentStatus} to ${newStatus}`);
        }

        let updateQuery = '';
        const params: any[] = [alertId, orgId, actorId];

        if (newStatus === 'ACKNOWLEDGED') {
            updateQuery = `UPDATE alerts SET status = 'ACKNOWLEDGED', acknowledged_by = $3, acknowledged_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`;
        } else if (newStatus === 'RESOLVED') {
            updateQuery = `UPDATE alerts SET status = 'RESOLVED', resolved_by = $3, resolved_at = NOW(), resolution_note = $4 WHERE id = $1 AND organization_id = $2 RETURNING *`;
            params.push(note || null);
        } else if (newStatus === 'DISMISSED') {
            updateQuery = `UPDATE alerts SET status = 'DISMISSED', dismissed_by = $3, dismissed_at = NOW(), resolution_note = $4 WHERE id = $1 AND organization_id = $2 RETURNING *`;
            params.push(note || null);
        }

        const result = await db.query(updateQuery, params);

        await AuditService.log({
            organization_id: orgId,
            user_id: actorId,
            action: `alert.status.${newStatus.toLowerCase()}`,
            resource_type: 'alert',
            resource_id: alertId
        });

        return result.rows[0];
    }

    /**
     * Fetch recent alerts scoped to an organization.
     */
    static async getAlerts(orgId: string, limit = 50) {
        const result = await db.query(
            `SELECT id, event_id, type, rule_id, severity, status, title, description, entity, evidence,
                    resolution_note, created_at, resolved_at, acknowledged_at, dismissed_at, suppression_count
             FROM alerts 
             WHERE organization_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [orgId, limit],
        );
        return result.rows;
    }
}
