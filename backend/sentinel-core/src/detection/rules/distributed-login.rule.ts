import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';

export const distributedLogin: DetectionRule = {
    id: 'distributed-login',
    description: 'Detects distributed brute-force attacks where multiple distinct IPs target a single account within a 5-minute window',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        if (event.type !== 'login_failed' || !event.email || !event.ip) {
            return null;
        }

        const email = event.email;
        const ip = event.ip;

        // Use a Redis Set to store unique IPs targeting this account
        const setKey = `attack:account:${ctx.orgId}:${email}:ips`;

        const pipeline = ctx.redis.pipeline();
        pipeline.sadd(setKey, ip);
        pipeline.expire(setKey, 300, 'NX'); // 5 minutes sliding window
        pipeline.scard(setKey);

        const results = await pipeline.exec();
        if (!results) return null;

        const uniqueIpsCount = (results[2]?.[1] as number) || 0;

        if (uniqueIpsCount >= 10) {
            return {
                ruleId: distributedLogin.id,
                severity: 'critical',
                entity: email,
                evidence: {
                    ipCount: uniqueIpsCount,
                    threshold: 10,
                    window: '5m',
                    module: 'Distributed Credential Attack'
                }
            };
        }

        return null;
    }
};
