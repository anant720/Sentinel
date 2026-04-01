import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { db } from '../lib/database.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

class RapidFailedLoginsModule implements DetectionModule {
    name = 'rapid_failed_logins';

    subscribesTo(): string[] {
        return ['login_failed'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;

        if (!email) return;

        const logCtx = { orgId, email, module: this.name };

        try {
            const key5m = `fail:account:${orgId}:${email}:5m`;
            const key30m = `fail:account:${orgId}:${email}:30m`;
            const key24h = `fail:account:${orgId}:${email}:24h`;

            const pipeline = redis.pipeline();
            pipeline.incr(key5m);
            pipeline.expire(key5m, 300, 'NX');
            pipeline.incr(key30m);
            pipeline.expire(key30m, 1800, 'NX');
            pipeline.incr(key24h);
            pipeline.expire(key24h, 86400, 'NX');

            const results = await pipeline.exec();
            if (!results) return;

            const count5m = (results[0]?.[1] as number) || 0;
            const count30m = (results[2]?.[1] as number) || 0;
            const count24h = (results[4]?.[1] as number) || 0;

            let severity: 'medium' | 'high' | 'critical' = 'medium';
            let triggered = false;
            let windowUsed = '';
            let countUsed = 0;

            const t5m = context.config?.threshold5m || 5;
            const t30m = context.config?.threshold30m || 15;
            const t24h = context.config?.threshold24h || 50;

            if (count5m >= t5m) {
                triggered = true;
                severity = 'medium';
                windowUsed = '5m';
                countUsed = count5m;
            } else if (count30m >= t30m) {
                triggered = true;
                severity = 'high';
                windowUsed = '30m';
                countUsed = count30m;
            } else if (count24h >= t24h) {
                triggered = true;
                severity = 'critical';
                windowUsed = '24h';
                countUsed = count24h;
            }

            if (!triggered) return;

            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:rapid_fail:${email}:${windowUsed}:${Math.floor(Date.now() / 600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'rapid_failed_logins',
                severity,
                fingerprint,
                title: 'Rapid Failed Logins',
                description: `Detected ${countUsed} failed login attempts for ${email} in ${windowUsed}.`,
                metadata: { email, count: countUsed, window: windowUsed }
            });

        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'RapidFailedLogins module error');
        }
    }
}

export default new RapidFailedLoginsModule();
