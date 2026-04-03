import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * RISK SCORING ENGINE — Enterprise Edition
 *
 * A cross-module risk aggregation system that assigns cumulative risk scores to
 * specific entities (email or IP) on every security event.
 *
 * Key improvements:
 * - Time-decay: score auto-expires using TTL refresh on every hit
 * - login_success REDUCES the risk score (proof of identity = trust restoration)
 * - Expanded event weight map covering all 12 detection module event types
 * - Multi-tier alert thresholds: medium (50), high (75), critical (100)
 */
class RiskScoringModule implements DetectionModule {
    name = 'risk_scoring';

    subscribesTo(): string[] {
        return ['*'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Risk Score Aggregation',
            description: 'Cross-module cumulative risk engine with 4h time-decay. 20+ event weights. login_success REDUCES score. 3-tier thresholds: Medium (50), High (75), Critical (100).',
            icon: 'query_stats',
            category: 'behavioral' as const,
            configFields: [
                { key: 'thresholdMedium',   label: 'Medium threshold',   default: 50 },
                { key: 'thresholdHigh',     label: 'High threshold',     default: 75 },
                { key: 'thresholdCritical', label: 'Critical threshold', default: 100 },
            ],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;
        const email   = payload?.email;
        const ip      = payload?.ip_address || payload?.ip;
        const type    = event.event_type;

        if (!email && !ip) return;

        // ── Risk Weight Map — every event type with a meaningful security signal ────────
        // Positive = increases risk, negative = decreases risk (trust restoration)
        const RISK_WEIGHTS: Record<string, number> = {
            // Authentication failures — attacker signals
            'login_failed':               +12,
            'login_failure':              +12,
            // Successful logins by known attackers — slight reduction (they "proved" something)
            'login_success':              -15,

            // High-confidence attack signals
            'scanner_detected':           +80,
            'directory_brute_force':      +55,
            'suspicious_http_request':    +30,
            'distributed_login':          +65,
            'rapid_failed_logins':        +50,
            'rapid_failed_logins_ip':     +45,
            'password_spraying':          +70,
            
            // Identity compromise signals
            'impossible_travel':          +75,
            'new_device_logon':           +40,
            'privilege_escalation':       +85,
            'enrollment_token_abuse':     +60,
            'fingerprint_campaign':       +55,
            'device_anomaly_burst':       +45,

            // Integrity violations
            'signature_failure':          +35,
            'replay_attempt':             +45,

            // Lockout/enforcement signals
            'lockout_triggered':          +25,
        };

        const delta = RISK_WEIGHTS[type];
        if (delta === undefined) return; // Unknown event type — skip

        const entity  = email || ip!;
        const riskKey = `risk:entity:${orgId}:${entity}`;

        // Apply delta (increment or decrement)
        const pipe = redis.pipeline();
        if (delta > 0) {
            pipe.incrby(riskKey, delta);
        } else {
            pipe.decrby(riskKey, Math.abs(delta));
        }
        // Time-decay: every update refreshes TTL to 4 hours. Inactive entities auto-expire.
        pipe.expire(riskKey, 14400); // 4 hours TTL refresh

        const results = await pipe.exec();
        if (!results) return;

        let currentRisk = (results[0]?.[1] as number) || 0;

        // Clamp score to [0, 500] — don't let it go negative or infinitely high
        if (currentRisk < 0) {
            await redis.set(riskKey, '0', 'EX', 14400);
            currentRisk = 0;
        }
        if (currentRisk > 500) {
            await redis.set(riskKey, '500', 'EX', 14400);
            currentRisk = 500;
        }

        // Multi-tier alert thresholds (only alert on increase events)
        if (delta <= 0) return;

        const thresholdCritical = context.config?.thresholdCritical ?? 100;
        const thresholdHigh     = context.config?.thresholdHigh     ?? 75;
        const thresholdMedium   = context.config?.thresholdMedium   ?? 50;

        let severity: 'medium' | 'high' | 'critical' | null = null;
        let tier = '';

        if (currentRisk >= thresholdCritical) {
            severity = 'critical'; tier = `${thresholdCritical}+`;
        } else if (currentRisk >= thresholdHigh) {
            severity = 'high'; tier = `${thresholdHigh}+`;
        } else if (currentRisk >= thresholdMedium) {
            severity = 'medium'; tier = `${thresholdMedium}+`;
        }

        if (!severity) return;

        // Use 10-minute bucket to avoid duplicate alerts per scoring tier per entity
        const bucket = Math.floor(Date.now() / 600000);
        const fp = crypto.createHash('sha256')
            .update(`${orgId}:risk_score:${entity}:${severity}:${bucket}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'risk_threshold_breach',
            severity,
            fingerprint: fp,
            title: 'Entity Risk Score Threshold Breach',
            description: `Entity ${entity} reached a cumulative risk score of ${currentRisk} (Tier: ${tier}). Triggered by: ${type}.`,
            metadata: {
                entity,
                score: currentRisk,
                delta,
                threshold_tier: tier,
                triggering_event: type
            }
        });
    }
}

export default new RiskScoringModule();
