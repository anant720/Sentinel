import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class RiskScoringModule implements DetectionModule {
    name = 'risk_scoring';

    subscribesTo(): string[] {
        return ['*'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;
        const ip = event.payload?.ip_address || event.payload?.ip;

        if (!email && !ip) return;

        let riskDelta = 0;
        const type = event.event_type;

        // Map risk weights
        if (type === 'login_failed' || type === 'login_failure') riskDelta = 10;
        else if (type === 'signature_failure') riskDelta = 30;
        else if (type === 'replay_attempt') riskDelta = 40;
        else if (type === 'distributed_login') riskDelta = 50;
        else if (type === 'directory_brute_force') riskDelta = 50;
        else if (type === 'path_scan_detected') riskDelta = 30;
        else if (type === 'scanner_detected') riskDelta = 80;
        else if (type === 'burst_scan_detected') riskDelta = 60;

        if (riskDelta === 0) return;

        const entity = email || ip;
        const riskKey = `risk:account:${orgId}:${entity}`;

        const pipeline = redis.pipeline();
        pipeline.incrby(riskKey, riskDelta);
        pipeline.expire(riskKey, 3600, 'NX');

        const results = await pipeline.exec();
        if (!results) return;

        const currentRisk = (results[0]?.[1] as number) || 0;
        const threshold = context.config?.threshold || 100;

        if (currentRisk >= threshold) {
            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:risk_score_breach:${entity}:${Math.floor(Date.now() / 3600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'risk_threshold_breach',
                severity: 'critical',
                fingerprint,
                title: 'High Risk Threshold Breach',
                description: `Entity ${entity} has reached a cumulative risk score of ${currentRisk} (Threshold: ${threshold}).`,
                metadata: {
                    entity,
                    score: currentRisk,
                    last_event: type
                }
            });
        }
    }
}

export default new RiskScoringModule();
