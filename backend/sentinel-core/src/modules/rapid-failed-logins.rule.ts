import { DetectionEvent, DetectionRule, DetectionAlert, DetectionContext } from '../detection/types.js';

export const rapidFailedLogins: DetectionRule = {
    id: 'rapid_failed_logins',
    description: 'Detects multiple failed logins across different time windows for a single account',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        if (event.type !== 'login_failure' || !event.email) {
            return null;
        }

        const email = event.email;
        const key5m = `fail:account:${ctx.orgId}:${email}:5m`;
        const key30m = `fail:account:${ctx.orgId}:${email}:30m`;
        const key24h = `fail:account:${ctx.orgId}:${email}:24h`;

        // Pipeline to ensure atomicity and speed natively
        const pipeline = ctx.redis.pipeline();

        pipeline.incr(key5m);
        pipeline.expire(key5m, 300, 'NX'); // 5 minutes

        pipeline.incr(key30m);
        pipeline.expire(key30m, 1800, 'NX'); // 30 minutes

        pipeline.incr(key24h);
        pipeline.expire(key24h, 86400, 'NX'); // 24 hours

        const results = await pipeline.exec();
        if (!results) return null;

        const count5m = (results[0] && results[0][1] as number) || 0;
        const count30m = (results[2] && results[2][1] as number) || 0;
        const count24h = (results[4] && results[4][1] as number) || 0;

        let triggered = false;
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        let evidence: any = {};

        const threshold5m = ctx.config?.threshold5m || 5;
        const threshold30m = ctx.config?.threshold30m || 10;
        const threshold24h = ctx.config?.threshold24h || 20;

        if (count5m >= threshold5m) {
            triggered = true;
            evidence = { window: '5m', count: count5m, threshold: threshold5m };
        } else if (count30m >= threshold30m) {
            triggered = true;
            severity = 'high';
            evidence = { window: '30m', count: count30m, threshold: threshold30m };
        } else if (count24h >= threshold24h) {
            triggered = true;
            severity = 'critical';
            evidence = { window: '24h', count: count24h, threshold: threshold24h };
        }

        if (triggered) {
            return {
                ruleId: rapidFailedLogins.id,
                severity,
                entity: email,
                evidence: {
                    ...evidence,
                    module: 'Rapid Consecutive Failed Logins'
                }
            };
        }

        return null;
    }
};
