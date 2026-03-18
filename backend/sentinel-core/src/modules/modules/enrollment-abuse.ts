import { DetectionModule, DetectionContext } from '../src/core/detection.types.js';
import { AlertService } from '../src/services/alert.service.js';
import { logger } from '../src/lib/logger.js';
import crypto from 'crypto';

class EnrollmentAbuseModule implements DetectionModule {
    name = 'enrollment_token_abuse';

    subscribesTo(): string[] {
        return ['enrollment_token_abuse'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;

        const { failed_enrollment_reason, token_id, attempted_device_name } = event.payload || {};

        // Fingerprint bound uniquely to the event to prevent duplicate alert insertion
        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:enrollment_abuse:${event.id}`)
            .digest('hex');

        const logCtx = { orgId, eventId: event.id, token_id, failed_enrollment_reason, attempted_device_name };

        try {
            const alertResult = await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'enrollment_token_abuse',
                severity: 'medium',
                title: 'Enrollment Token Abuse Attempt',
                description: `A device identifying as "${attempted_device_name || 'UNKNOWN'}" attempted to register using an enrollment token that is ${failed_enrollment_reason}.`,
                fingerprint,
                metadata: {
                    failed_enrollment_reason,
                    token_id,
                    attempted_device_name
                }
            });

            if (alertResult) {
                logger.warn(logCtx, `🚨 DETECTION FIRED: Replay or harvest attempt on Enrollment Token (${failed_enrollment_reason})`);
            }
        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'Execution error in Enrollment Token Abuse detection module');
        }
    }
}

export default new EnrollmentAbuseModule();
