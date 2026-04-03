import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * PRIVILEGE ESCALATION — Enterprise Edition
 *
 * Detects unauthorized or suspicious elevation of user roles to admin/owner level.
 * Mirrors CrowdStrike Falcon Identity's "Privilege Escalation" detection logic.
 *
 * Key improvements:
 * - Self-promotion detection: actor elevating their OWN account = critical
 * - Rapid campaign: multiple escalations by same actor in 30 minutes = critical
 * - Off-hours bonus: privilege changes at 2AM–5AM local time = higher severity
 */
class PrivilegeEscalationModule implements DetectionModule {
    name = 'privilege_escalation';

    subscribesTo(): string[] {
        return ['user_role_updated'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const { target_user_id, previous_role, new_role, actor_id } = event.payload || {};

        // Only care about escalations TO admin or owner
        if (new_role !== 'admin' && new_role !== 'owner') return;

        const now = Date.now();
        let severity: 'high' | 'critical' = 'high';
        const riskFactors: string[] = [`role elevated ${previous_role || '?'} → ${new_role}`];

        // CRITICAL SIGNAL 1: Self-promotion (actor elevating themselves)
        if (actor_id && target_user_id && actor_id === target_user_id) {
            severity = 'critical';
            riskFactors.push('SELF-PROMOTION: actor escalated their own account');
        }

        // CRITICAL SIGNAL 2: Owner-level promotion is always critical
        if (new_role === 'owner') {
            severity = 'critical';
            riskFactors.push('promoted to OWNER (highest privilege tier)');
        }

        // Off-hours detection
        const hour = new Date().getUTCHours();
        if (hour >= 2 && hour <= 5) {
            riskFactors.push('privilege change during off-hours (02:00-05:00 UTC)');
            if (severity === 'high') severity = 'critical';
        }

        // Rapid escalation campaign: track how many accounts actor escalated in 30min
        if (actor_id) {
            const campaignKey = `priv:campaign:${orgId}:${actor_id}`;
            const pipe = redis.pipeline();
            pipe.zadd(campaignKey, 'NX', now, `${target_user_id}:${now}`);
            pipe.zremrangebyscore(campaignKey, 0, now - 30 * 60 * 1000);
            pipe.zcard(campaignKey);
            pipe.expire(campaignKey, 3600);
            const results = await pipe.exec();
            const escalationsIn30m = (results?.[2]?.[1] as number) || 0;
            if (escalationsIn30m >= 3) {
                severity = 'critical';
                riskFactors.push(`rapid escalation campaign: ${escalationsIn30m} accounts promoted in 30 minutes`);
            }
        }

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:privilege_escalation:${event.id}`)
            .digest('hex');

        const logCtx = { orgId, eventId: event.id, target_user_id, new_role, actor_id, severity };

        try {
            const alertResult = await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'privilege_escalation',
                severity,
                title: severity === 'critical' ? '🚨 Critical Privilege Escalation' : 'Suspicious Privilege Escalation',
                description: `Actor ${actor_id || 'UNKNOWN'} elevated ${target_user_id || 'a user'} to ${new_role}. Risk factors: ${riskFactors.join('; ')}.`,
                fingerprint,
                metadata: {
                    target_user_id,
                    actor_id,
                    previous_role,
                    new_role,
                    risk_factors: riskFactors,
                    self_promotion: actor_id === target_user_id,
                }
            });

            if (alertResult) {
                logger.warn(logCtx, `🚨 Privilege Escalation detected (${severity.toUpperCase()}): ${riskFactors.join(', ')}`);
            }
        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'Privilege escalation module error');
        }
    }
}

export default new PrivilegeEscalationModule();
