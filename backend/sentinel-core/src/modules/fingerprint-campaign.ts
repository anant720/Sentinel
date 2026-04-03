import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * AUTOMATED CAMPAIGN DETECTION (Fingerprint Campaign) — Enterprise Edition
 *
 * Detects automated attack campaigns by tracking the request fingerprint
 * (IP + User-Agent combination) across events, regardless of event type.
 *
 * Key improvements:
 * - Fixed hash: no longer includes event_type (was causing split counters per attack type)
 * - UA-less fallback: treats IP alone as fingerprint if UA is empty (headless tool signature)
 * - Escalating severity: high at 10+ events, critical at 50+ events per hour
 * - Tracks hit rate for richer alert context
 */
class FingerprintCampaignModule implements DetectionModule {
    name = 'fingerprint_campaign';

    subscribesTo(): string[] {
        return ['*'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;
        const ip = payload?.ip_address || payload?.ip;
        const ua = payload?.user_agent || payload?.userAgent || '';

        if (!ip) return;

        const now = Date.now();

        // CRITICAL FIX: Hash only IP + UA — removing event_type prevents counter splitting.
        // If UA is empty (headless/automated script), fall back to IP alone as fingerprint.
        const fingerprintInput = ua ? `${ip}:${ua}` : ip;
        const fpHash = crypto.createHash('sha256').update(fingerprintInput).digest('hex');

        // Sliding 1-hour window using sorted set
        const counterKey = `attack:campaign:${orgId}:${fpHash}`;
        const pipe = redis.pipeline();
        pipe.zadd(counterKey, 'NX', now, `${event.id}:${now}`);
        pipe.zremrangebyscore(counterKey, 0, now - 3600 * 1000); // 1-hour sliding window
        pipe.zcard(counterKey);
        pipe.expire(counterKey, 7200);

        const results = await pipe.exec();
        if (!results) return;

        const hitCount = (results[2]?.[1] as number) || 0;

        const thresholdHigh     = context.config?.thresholdHigh     ?? 10;
        const thresholdCritical = context.config?.thresholdCritical ?? 50;

        let severity: 'high' | 'critical' | null = null;
        if (hitCount >= thresholdCritical) severity = 'critical';
        else if (hitCount >= thresholdHigh) severity = 'high';

        if (!severity) return;

        // Suppress re-alerts within same 10-minute window for this fingerprint at this severity
        const suppressKey = `attack:campaign:${orgId}:${fpHash}:suppress:${severity}`;
        const suppressed = await redis.set(suppressKey, '1', 'EX', 600, 'NX');
        if (!suppressed) return;

        const alertFp = crypto.createHash('sha256')
            .update(`${orgId}:campaign:${fpHash}:${severity}:${Math.floor(now / 600000)}`)
            .digest('hex');

        const hitRate = Math.round(hitCount / 60); // avg hits/min over last hour

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'fingerprint_campaign',
            severity,
            fingerprint: alertFp,
            title: severity === 'critical' ? 'High-Volume Automated Attack Campaign' : 'Automated Attack Campaign Detected',
            description: `Attack fingerprint ${fpHash.slice(0, 12)}… from IP ${ip} generated ${hitCount} events in the last hour (~${hitRate}/min). ${ua ? `Tool/Agent: "${ua.slice(0, 80)}"` : 'No User-Agent present (headless automated script).'}`,
            metadata: {
                ip,
                user_agent: ua || null,
                fingerprint_hash: fpHash.slice(0, 16),
                hit_count_1h: hitCount,
                hit_rate_per_min: hitRate,
                headless: !ua
            }
        });
    }
}

export default new FingerprintCampaignModule();
