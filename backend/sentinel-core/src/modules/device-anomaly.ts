import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * DEVICE ANOMALY BURST — Enterprise Edition
 *
 * Detects when a device emits events at an anomalous rate (potential malware,
 * compromised agent, or data exfiltration beacon).
 *
 * Key improvements:
 * - Redis counter replaces DB query (faster, doesn't hit DB on every event)
 * - Sliding window instead of fixed window
 * - Lower default threshold (20/min for browser-type devices)
 * - Escalating severity tiers based on rate multiplier
 */
class DeviceAnomalyModule implements DetectionModule {
    name = 'device_anomaly_burst';

    subscribesTo(): string[] {
        return ['*'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;

        if (!event.device_id) return;

        const deviceId  = event.device_id;
        const threshold = context.config?.threshold      ?? 20; // events/min (industry standard default)
        const critMult  = context.config?.critMultiplier ?? 3;  // 3x threshold = critical

        const now = Date.now();

        // Redis sliding window — pure in-memory, sub-millisecond
        const rateKey = `device:burst:${orgId}:${deviceId}`;
        const pipe = redis.pipeline();
        pipe.zadd(rateKey, 'NX', now, `${event.id}:${now}`);
        pipe.zremrangebyscore(rateKey, 0, now - 60 * 1000); // 1-minute window
        pipe.zcard(rateKey);
        pipe.expire(rateKey, 300);

        const results = await pipe.exec();
        if (!results) return;

        const eventsPerMin = (results[2]?.[1] as number) || 0;

        if (eventsPerMin < threshold) return;

        // Severity tier based on how far above threshold the device is
        const ratio = eventsPerMin / threshold;
        let severity: 'medium' | 'high' | 'critical' = 'medium';
        if (ratio >= critMult) severity = 'critical';
        else if (ratio >= 2)   severity = 'high';

        // 5-minute suppression per device per severity to avoid alert storms
        const suppressKey = `device:suppress:${orgId}:${deviceId}:${severity}`;
        const suppressed  = await redis.set(suppressKey, '1', 'EX', 300, 'NX');
        if (!suppressed) return;

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:device_burst:${deviceId}:${Math.floor(now / 300000)}`)
            .digest('hex');

        const alertResult = await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'device_anomaly_burst',
            severity,
            fingerprint,
            title: 'Device Anomaly: Abnormal Event Rate',
            description: `Device ${deviceId} is emitting ${eventsPerMin} events/min (threshold: ${threshold}/min). Potential malware, compromised agent, or data beaconing.`,
            metadata: {
                device_id: deviceId,
                events_per_min: eventsPerMin,
                threshold,
                rate_multiplier: Math.round(ratio * 10) / 10
            }
        });

        if (alertResult) {
            logger.warn({ orgId, deviceId, eventsPerMin, threshold, severity }, '🚨 Device anomaly burst detected');
        }
    }
}

export default new DeviceAnomalyModule();
