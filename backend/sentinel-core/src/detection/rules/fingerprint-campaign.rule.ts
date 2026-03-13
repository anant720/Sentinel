import crypto from 'crypto';
import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';

export const fingerprintCampaign: DetectionRule = {
    id: 'fingerprint-campaign',
    description: 'Detects automated campaigns exhibiting identical event fingerprints across boundaries',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        // Build the physical fingerprint natively matching the requirements
        if (!event.ip || !event.userAgent || !event.type) {
            return null;
        }

        const hashInput = `${event.ip}:${event.userAgent}:${event.type}`;
        const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

        const counterKey = `attack:fingerprint:${ctx.orgId}:${hash}`;

        const pipeline = ctx.redis.pipeline();
        pipeline.incr(counterKey);
        pipeline.expire(counterKey, 3600, 'NX'); // 1 hour footprint limits

        const results = await pipeline.exec();
        if (!results) return null;

        const triggerCount = (results[0]?.[1] as number) || 0;

        if (triggerCount >= 50) {
            return {
                ruleId: fingerprintCampaign.id,
                severity: 'high',
                entity: hash.substring(0, 12),
                evidence: {
                    count: triggerCount,
                    threshold: 50,
                    window: '1h',
                    module: 'Automated Event Fingerprinting'
                }
            };
        }

        return null;
    }
};
