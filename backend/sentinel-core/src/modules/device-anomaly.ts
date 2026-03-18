import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { db } from '../lib/database.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

class DeviceAnomalyModule implements DetectionModule {
    name = 'device_anomaly_burst';

    subscribesTo(): string[] {
        return ['*']; // Observe ALL events, we are looking for volume regardless of type
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, config } = context;

        // Skip internal events that don't originate from a physical endpoint
        if (!event.device_id) return;

        // Extract threshold from config, or default to 100 events / minute
        const threshold = config?.threshold || 100;
        const windowMinutes = config?.window_minutes || 1;

        const logCtx = { orgId, eventId: event.id, deviceId: event.device_id, module: this.name };

        try {
            // Count total events emitted by this device in the trailing window
            const countResult = await db.query(
                `SELECT COUNT(*) 
                 FROM events
                 WHERE organization_id = $1
                   AND device_id = $2
                   AND created_at >= $3::timestamptz - INTERVAL '${windowMinutes} minutes'`,
                [orgId, event.device_id, event.created_at]
            );

            const count = parseInt(countResult.rows[0]?.count || '0', 10);

            if (count >= threshold) {
                logger.info({ ...logCtx, count, threshold }, `Threshold evaluated: ${count} within ${windowMinutes}m`);

                // Fingerprint using a 5-minute bucket so we don't spam the DB during an ongoing burst
                const suppressionWindowMs = 5 * 60 * 1000;
                const bucket = Math.floor(Date.now() / suppressionWindowMs);
                const fingerprint = crypto
                    .createHash('sha256')
                    .update(`${orgId}:device_burst:${event.device_id}:${bucket}`)
                    .digest('hex');

                const alertResult = await AlertService.createAlert(orgId, {
                    eventId: event.id,
                    type: 'device_anomaly_burst',
                    severity: 'high',
                    title: 'Device Anomaly (Burst Data)',
                    description: `Device ${event.device_id} is emitting data at an anomalous rate. Detected ${count} events over ${windowMinutes} minutes.`,
                    fingerprint,
                    metadata: {
                        device_id: event.device_id,
                        count,
                        threshold,
                        window_minutes: windowMinutes
                    }
                });

                if (alertResult) {
                    logger.warn(logCtx, `🚨 Detection Fired: Device burst volume of ${count} events in ${windowMinutes}m`);
                }
            }
        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'Execution error in device anomaly detection module');
        }
    }
}

export default new DeviceAnomalyModule();
