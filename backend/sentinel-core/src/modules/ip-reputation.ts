import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * IP REPUTATION ENGINE — Enterprise Edition (NEW MODULE)
 *
 * Cross-module IP reputation scoring system that aggregates signals from all other
 * detection modules to produce a holistic threat score for each IP address.
 *
 * This is the "IP Ban" trigger that real-world ITDR platforms (Okta ThreatInsight,
 * Microsoft Entra Identity Protection) use to eventually block malicious IPs.
 *
 * Every time ANY other module fires on an IP, this module adjusts the IP's reputation score.
 * When the score crosses a threshold, a "Malicious IP" Critical alert is generated with
 * an explicit BAN recommendation — which could be fed to a WAF or Cloudflare.
 */
class IpReputationModule implements DetectionModule {
    name = 'ip_reputation';

    subscribesTo(): string[] {
        return ['*'];
    }

    // Reputation damage weights per event type — most are from the IP's own behavior
    private readonly IP_DAMAGE: Record<string, number> = {
        // Login attack signals
        'login_failed':               +5,
        'login_failure':              +5,
        'login_success':              -3,  // Successful auth = slight reputation recovery
        // Scanning / exploitation signals
        'scanner_detected':           +60,
        'suspicious_http_request':     +15,
        'directory_brute_force':       +40,
        // Cross-account attack signals
        'password_spraying':           +70,
        'distributed_login':           +50,
        'rapid_failed_logins_ip':      +45,
        'fingerprint_campaign':        +55,
        // High-confidence signals
        'enrollment_token_abuse':      +35,
        'security_tool_detected':      +65,
    };

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const ip = event.payload?.ip_address || event.payload?.ip || event.ip_address;

        if (!ip || ip === 'unknown' || ip === 'unknown-ip') return;

        const damage = this.IP_DAMAGE[event.event_type];
        if (damage === undefined) return;

        const now = Date.now();
        const repKey = `rep:ip:${orgId}:${ip}`;

        const pipe = redis.pipeline();
        if (damage > 0) {
            pipe.incrby(repKey, damage);
        } else {
            pipe.decrby(repKey, Math.abs(damage));
        }
        // 24-hour rolling window — inactive IPs auto-recover
        pipe.expire(repKey, 86400);
        const results = await pipe.exec();
        if (!results) return;

        let score = (results[0]?.[1] as number) || 0;

        // Clamp to [0, 1000]
        score = Math.max(0, Math.min(1000, score));

        if (damage <= 0) return; // Don't alert on score reductions

        // Thresholds — graded by threat certainty
        const thresholdWarn     = context.config?.thresholdWarn     ?? 100;
        const thresholdBlock    = context.config?.thresholdBlock     ?? 200;
        const thresholdBan      = context.config?.thresholdBan      ?? 350;

        let severity: 'medium' | 'high' | 'critical' | null = null;
        let recommendation = '';

        if (score >= thresholdBan) {
            severity = 'critical';
            recommendation = 'IMMEDIATE BAN RECOMMENDED — IP has a sustained malicious reputation score';
        } else if (score >= thresholdBlock) {
            severity = 'high';
            recommendation = 'BLOCK RECOMMENDED — IP shows consistent attack patterns across multiple vectors';
        } else if (score >= thresholdWarn) {
            severity = 'medium';
            recommendation = 'MONITOR — IP has crossed suspicious threshold';
        }

        if (!severity) return;

        // Suppress re-alerts — 30 min per IP per severity tier
        const suppressKey = `rep:suppress:${orgId}:${ip}:${severity}`;
        const suppressed  = await redis.set(suppressKey, '1', 'EX', 1800, 'NX');
        if (!suppressed) return;

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:ip_reputation:${ip}:${severity}:${Math.floor(now / 1800000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'malicious_ip_detected',
            severity,
            fingerprint,
            title: `IP Reputation Alert: ${ip}`,
            description: `IP ${ip} has a cumulative reputation score of ${score}/1000. Triggering event: ${event.event_type}. ${recommendation}.`,
            metadata: {
                ip,
                reputation_score: score,
                threshold_warn: thresholdWarn,
                threshold_block: thresholdBlock,
                threshold_ban: thresholdBan,
                triggering_event: event.event_type,
                recommendation
            }
        });

        logger.warn({ orgId, ip, score, severity, recommendation }, '🚨 IP Reputation threshold breached');
    }
}

export default new IpReputationModule();
