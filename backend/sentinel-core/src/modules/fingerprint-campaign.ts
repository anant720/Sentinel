import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class FingerprintCampaignModule implements DetectionModule {
    name = 'fingerprint_campaign';

    subscribesTo(): string[] {
        return ['*'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const ip = event.payload?.ip_address || event.payload?.ip;
        const ua = event.payload?.user_agent || event.payload?.userAgent;

        if (!ip || !ua) return;

        const hashInput = `${ip}:${ua}:${event.event_type}`;
        const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

        const counterKey = `attack:fingerprint:${orgId}:${hash}`;

        const pipeline = redis.pipeline();
        pipeline.incr(counterKey);
        pipeline.expire(counterKey, 3600, 'NX'); // 1 hour window

        const results = await pipeline.exec();
        if (!results) return;

        const triggerCount = (results[0]?.[1] as number) || 0;
        const threshold = context.config?.threshold || 10;

        if (triggerCount >= threshold) {
            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:fingerprint_campaign:${hash}:${Math.floor(Date.now() / 3600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'fingerprint_campaign',
                severity: 'high',
                fingerprint,
                title: 'Automated Campaign Detected',
                description: `Detected 10+ identical event fingerprints from ${ip} within 1 hour.`,
                metadata: {
                    ip,
                    user_agent: ua,
                    count: triggerCount,
                    event_type: event.event_type
                }
            });
        }
    }
}

export default new FingerprintCampaignModule();
