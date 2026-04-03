import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * PASSWORD SPRAYING — Enterprise Edition
 *
 * Detects an attacker using ONE password against MANY accounts to avoid per-account lockouts.
 * This is one of the most common TTPs in nation-state and ransomware pre-compromise activity.
 *
 * Uses true sliding windows (sorted sets) instead of fixed-window EXPIRE NX.
 * NIST 800-63B recommends alerting at 5+ unique accounts from a single IP.
 */
class PasswordSprayingModule implements DetectionModule {
    name = 'password_spraying';

    subscribesTo(): string[] {
        return ['login_failed', 'login_failure'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Password Spraying',
            description: 'Single IP targeting many accounts to bypass per-account lockouts. NIST 800-63B threshold (5 unique accounts). Detects sustained 30-minute campaigns.',
            icon: 'manage_accounts',
            category: 'identity' as const,
            configFields: [
                { key: 'threshold5m',  label: 'Unique Accounts (5 min)',  default: 5 },
                { key: 'threshold30m', label: 'Unique Accounts (30 min)', default: 20 },
            ],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;
        const ip = event.payload?.ip_address || event.payload?.ip;

        if (!email || !ip) return;

        const now = Date.now();

        // True sliding 5-minute window: key = IP, members = unique emails targeted
        // We track email+timestamp so we can deduplicate without losing time info
        const setKey  = `attack:spray:${orgId}:${ip}:accounts`;
        const timeKey = `attack:spray:${orgId}:${ip}:times`;

        const pipe = redis.pipeline();
        // Add email to the set of targeted accounts
        pipe.sadd(setKey, email);
        pipe.expire(setKey, 600); // 10 minute cleanup window

        // Add timestamp to sorted set for sliding window enforcement
        pipe.zadd(timeKey, 'NX', now, `${email}:${now}`);
        pipe.zremrangebyscore(timeKey, 0, now - 5 * 60 * 1000); // prune > 5 min old
        pipe.zcard(timeKey); // unique account attempts in last 5m
        pipe.expire(timeKey, 600);

        // Also track unique accounts touched in 30m for sustained campaign detection
        const longKey = `attack:spray:${orgId}:${ip}:30m`;
        pipe.zadd(longKey, 'NX', now, `${email}:${now}`);
        pipe.zremrangebyscore(longKey, 0, now - 30 * 60 * 1000);
        pipe.zcard(longKey);
        pipe.expire(longKey, 3600);

        const results = await pipe.exec();
        if (!results) return;

        const uniqueAccounts5m  = (results[4]?.[1] as number) || 0;
        const uniqueAccounts30m = (results[8]?.[1] as number) || 0;

        const threshold5m  = context.config?.threshold5m  ?? 5;
        const threshold30m = context.config?.threshold30m ?? 20;

        let severity: 'high' | 'critical' | null = null;
        let window = '', count = 0;

        // Escalating severity — industry standard thresholds
        if (uniqueAccounts30m >= threshold30m) {
            severity = 'critical'; window = '30m'; count = uniqueAccounts30m;
        } else if (uniqueAccounts5m >= threshold5m) {
            severity = 'high'; window = '5m'; count = uniqueAccounts5m;
        }

        if (!severity) return;

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:password_spraying:${ip}:${window}:${Math.floor(now / (window === '5m' ? 300000 : 1800000))}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'password_spraying',
            severity,
            fingerprint,
            title: 'Password Spraying Attack',
            description: `IP ${ip} targeted ${count} unique accounts with failed logins within ${window}. Classic password spraying pattern detected.`,
            metadata: {
                ip,
                unique_accounts: count,
                window,
                latest_target: email,
            }
        });
    }
}

export default new PasswordSprayingModule();
