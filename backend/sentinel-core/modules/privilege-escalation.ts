import { DetectionModule, DetectionContext } from '../src/core/detection.types.js';
import { AlertService } from '../src/services/alert.service.js';
import { logger } from '../src/lib/logger.js';
import crypto from 'crypto';

class PrivilegeEscalationModule implements DetectionModule {
    name = 'Privilege Escalation Detection';

    subscribesTo(): string[] {
        return ['user_role_updated'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;

        const { target_user_id, previous_role, new_role, actor_id } = event.payload || {};

        // We trigger an alert strictly when a Role is elevated to ADMIN or OWNER
        if (new_role !== 'admin' && new_role !== 'owner') return;

        // Fingerprint bound uniquely to the event to prevent duplicate alert insertion
        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:privilege_escalation:${event.id}`)
            .digest('hex');

        const logCtx = { orgId, eventId: event.id, target_user_id, new_role, actor_id };

        try {
            const alertResult = await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'privilege_escalation',
                severity: 'high',
                title: 'Suspicious Privilege Escalation',
                description: `A user role was elevated to ${new_role} by actor ${actor_id || 'UNKNOWN'}. Confirm this action was authorized.`,
                fingerprint,
                metadata: {
                    target_user_id,
                    previous_role,
                    new_role,
                    actor_id
                }
            });

            if (alertResult) {
                logger.warn(logCtx, `🚨 HIGH SEVERITY: Privilege Escalation detected (Role elevated to ${new_role})`);
            }
        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'Execution error in Privilege Escalation detection module');
        }
    }
}

export default new PrivilegeEscalationModule();
