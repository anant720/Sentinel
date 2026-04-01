import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { pool } from '../db/client.js';
import crypto from 'crypto';

class NewDeviceLogonModule implements DetectionModule {
    name = 'new_device_logon';

    subscribesTo(): string[] {
        return ['login_success', 'login_attempt'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;
        const payload = event.payload;

        const currentDeviceId = payload?.device_id;
        const userId = payload?.user_id;

        if (!currentDeviceId || !userId) return;

        // 1. Look up historical devices
        const historyResult = await pool.query(
            `SELECT DISTINCT (payload->>'device_id') as device_id
             FROM events
             WHERE organization_id = $1
               AND event_type = 'login_success'
               AND payload->>'user_id' = $2
               AND payload->>'device_id' IS NOT NULL
               AND id != $3
             LIMIT 20`,
            [orgId, userId, event.id]
        );

        const knownDevices = new Set(historyResult.rows.map((r: any) => r.device_id));

        if (knownDevices.has(currentDeviceId)) return;

        // 2. Risk Scoring
        let riskScore = 40;
        const currentCountry = payload?.geo?.country;

        const lastCountryResult = await pool.query(
            `SELECT (payload->'geo'->>'country') as last_country
             FROM events
             WHERE organization_id = $1 AND event_type = 'login_success' AND payload->>'user_id' = $2
             AND payload->'geo'->>'country' IS NOT NULL AND id != $3
             ORDER BY created_at DESC LIMIT 1`,
            [orgId, userId, event.id]
        );

        const lastCountry = lastCountryResult.rows[0]?.last_country;
        if (lastCountry && currentCountry && lastCountry !== currentCountry) {
            riskScore += 30;
        }

        const severity = riskScore >= 60 ? 'high' : 'medium';
        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:new_device:${userId}:${currentDeviceId}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'new_device_logon',
            severity,
            fingerprint,
            title: 'New Device Login Detected',
            description: `A login from an unrecognized device was detected for user ${payload.email || userId}.`,
            metadata: {
                device_id: currentDeviceId,
                risk_score: riskScore,
                last_country: lastCountry,
                current_country: currentCountry
            }
        });
    }
}

export default new NewDeviceLogonModule();
