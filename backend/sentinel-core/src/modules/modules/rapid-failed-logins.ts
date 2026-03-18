import { DetectionModule, DetectionContext } from '../src/core/detection.types.js';
import { db } from '../src/lib/database.js';
import { AlertService } from '../src/services/alert.service.js';
import { logger } from '../src/lib/logger.js';
import crypto from 'crypto';

class RapidFailedLoginsModule implements DetectionModule {
    name = 'rapid_failed_logins';

    subscribesTo(): string[] {
        return ['login_failed'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;

        // 1. Extract target identifier (email) from the event payload
        const email = event.payload?.email;
        if (!email) {
            return; // Cannot execute without a target to aggregate against
        }

        const logCtx = { orgId, eventId: event.id, email, module: this.name };

        try {
            // 2. Redis Stateful Counter (Count recent failed logins for this user)
            const redisKey = `login_fail:${orgId}:${email}`;
            const threshold = context.config?.threshold || 5;

            // Atomically increment the redis state
            const count = await context.redis.incr(redisKey);

            // Always set expiration on the first hit to bound memory (5 minutes = 300s)
            if (count === 1) {
                await context.redis.expire(redisKey, 300);
            }

            logger.info({ ...logCtx, count }, `Threshold evaluated: ${count} within 5m via Redis`);

            if (count < threshold) {
                return; // Suppress alert if threshold is not met
            }

            // 3. Deterministic Alert Fingerprint (10 minute bucketing)
            const suppressionWindowMs = 10 * 60 * 1000; // 10 minutes
            const bucket = Math.floor(Date.now() / suppressionWindowMs);
            const fingerprint = crypto
                .createHash('sha256')
                .update(`${orgId}:rapid_failed_login:${email}:${bucket}`)
                .digest('hex');

            // 4. Fire Alert (AlertService returns null if uniqueness constraint triggers)
            const alertResult = await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'rapid_failed_login',
                severity: 'medium',
                fingerprint,
                title: 'Rapid Failed Logins',
                description: `Detected ${count} failed login attempts targeting ${email} within 5 minutes.`,
                metadata: {
                    email,
                    count,
                    window: '5m',
                }
            });

            if (alertResult) {
                logger.warn(logCtx, `🚨 Detection Fired: ${count} failed logins in 5m`);
            }
        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message, stack: err.stack }, 'Execution error in detection module');
            // Deliberately swallow the error to fulfill the contract: "Must never throw uncaught errors."
        }
    }
}

export default new RapidFailedLoginsModule();
