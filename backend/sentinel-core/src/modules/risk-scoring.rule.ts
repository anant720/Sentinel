import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../detection/types.js';

export const riskScoring: DetectionRule = {
    id: 'risk_scoring',
    description: 'Increments an entity risk score dynamically and raises Critical alerts if breached',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        if (!event.email && !event.ip) return null;

        let riskDelta = 0;

        // Map risk weights
        if (event.type === 'login_failed') {
            riskDelta = 10;
        } else if (event.type === 'signature_failure') {
            riskDelta = 30;
        } else if (event.type === 'replay_attempt') {
            riskDelta = 40;
        } else if (event.type === 'distributed_attack_detected') {
            riskDelta = 50;
        } else if (event.type === 'directory_brute_force') {
            riskDelta = 50;
        } else if (event.type === 'path_scan_detected') {
            riskDelta = 30;
        } else if (event.type === 'scanner_detected') {
            riskDelta = 80;
        } else if (event.type === 'burst_scan_detected') {
            riskDelta = 60;
        }

        if (riskDelta === 0) return null;

        // Score based on email. Fallback to IP if email missing.
        const entity = event.email || event.ip!;
        const riskKey = `risk:account:${ctx.orgId}:${entity}`;

        const pipeline = ctx.redis.pipeline();
        pipeline.incrby(riskKey, riskDelta);
        pipeline.expire(riskKey, 3600, 'NX');

        const results = await pipeline.exec();
        if (!results) return null;

        const currentRisk = (results[0]?.[1] as number) || 0;

        if (currentRisk >= 100) {
            return {
                ruleId: riskScoring.id,
                severity: 'critical',
                entity: entity,
                evidence: {
                    score: currentRisk,
                    threshold: 100,
                    window: '1h',
                    module: 'High Risk Account Threshold'
                }
            };
        }

        return null;
    }
};
