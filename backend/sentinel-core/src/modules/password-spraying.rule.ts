import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../detection/types.js';

export const passwordSpraying: DetectionRule = {
    id: 'password_spraying',
    description: 'Detects password spraying attacks where a single IP targets multiple distinct accounts',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        if (event.type !== 'login_failure' || !event.email || !event.ip) {
            return null;
        }

        const email = event.email;
        const ip = event.ip;

        // Use a Redis Set to store unique accounts targeted by this IP
        const setKey = `attack:ip:${ctx.orgId}:${ip}:accounts`;

        const pipeline = ctx.redis.pipeline();
        pipeline.sadd(setKey, email);
        pipeline.expire(setKey, 300, 'NX'); // 5 minutes window
        pipeline.scard(setKey);

        const results = await pipeline.exec();
        if (!results) return null;

        const uniqueAccountsCount = (results[2]?.[1] as number) || 0;

        if (uniqueAccountsCount >= 10) {
            return {
                ruleId: passwordSpraying.id,
                severity: 'high',
                entity: ip,
                evidence: {
                    accountCount: uniqueAccountsCount,
                    threshold: 20,
                    window: '5m',
                    module: 'Password Spraying Attack'
                }
            };
        }

        return null;
    }
};
