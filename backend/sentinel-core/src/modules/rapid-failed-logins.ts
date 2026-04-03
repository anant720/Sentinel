import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { db } from '../lib/database.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * RAPID FAILED LOGINS — Enterprise Edition
 *
 * Detects brute-force attacks on a single account across two axes:
 *   1. Per-account failure rate (protects the target identity)
 *   2. Per-IP failure rate (detects the attacker's behavior regardless of which account they target)
 *
 * Severity escalates dynamically with volume, matching NIST SP 800-63B and OWASP guidelines.
 */
class RapidFailedLoginsModule implements DetectionModule {
    name = 'rapid_failed_logins';

    subscribesTo(): string[] {
        // CRITICAL FIX: subscribe to BOTH naming variants used by the auth controller
        return ['login_failed', 'login_failure'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Brute Force Detection',
            description: 'Dual-axis brute-force detection: per-account AND per-IP sliding windows. 4-tier dynamic severity (Low/Medium/High/Critical). Follows NIST 800-63B lockout guidelines.',
            icon: 'bolt',
            category: 'identity' as const,
            configFields: [
                { key: 'threshold5m',   label: 'Max Failures (5 min)',   default: 5 },
                { key: 'threshold15m',  label: 'Max Failures (15 min)',  default: 15 },
                { key: 'threshold1h',   label: 'Max Failures (1 hour)',  default: 40 },
                { key: 'ipThreshold5m', label: 'Max IP Failures (5 min)', default: 10 },
            ],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;
        const email = payload?.email;
        const ip = payload?.ip_address || payload?.ip;

        const logCtx = { orgId, email, ip, module: this.name };

        try {
            // ── 1. Per-Account Failure Counters (sliding windows via ZADD) ──────────────
            if (email) {
                const now = Date.now();
                const accountKey5m  = `fail:account:${orgId}:${email}:5m`;
                const accountKey15m = `fail:account:${orgId}:${email}:15m`;
                const accountKey1h  = `fail:account:${orgId}:${email}:1h`;

                const acc = redis.pipeline();
                // Use sorted sets for true sliding windows — score = epoch ms, member = unique event id
                acc.zadd(accountKey5m,  'NX', now, `${event.id}:${now}`);
                acc.zremrangebyscore(accountKey5m, 0, now - 5 * 60 * 1000);
                acc.zcard(accountKey5m);
                acc.expire(accountKey5m, 600);

                acc.zadd(accountKey15m, 'NX', now, `${event.id}:${now}`);
                acc.zremrangebyscore(accountKey15m, 0, now - 15 * 60 * 1000);
                acc.zcard(accountKey15m);
                acc.expire(accountKey15m, 1800);

                acc.zadd(accountKey1h, 'NX', now, `${event.id}:${now}`);
                acc.zremrangebyscore(accountKey1h, 0, now - 60 * 60 * 1000);
                acc.zcard(accountKey1h);
                acc.expire(accountKey1h, 7200);

                const accResults = await acc.exec();
                if (!accResults) return;

                const count5m  = (accResults[2]?.[1]  as number) || 0;
                const count15m = (accResults[6]?.[1]  as number) || 0;
                const count1h  = (accResults[10]?.[1] as number) || 0;

                // Dynamic severity — mirrors NIST 800-63B lockout guidance
                let severity: 'low' | 'medium' | 'high' | 'critical' | null = null;
                let window = '', count = 0;

                const t5m  = context.config?.threshold5m  ?? 5;
                const t15m = context.config?.threshold15m ?? 15;
                const t1h  = context.config?.threshold1h  ?? 40;

                if (count1h >= t1h) {
                    severity = 'critical'; window = '1h'; count = count1h;
                } else if (count15m >= t15m) {
                    severity = 'high'; window = '15m'; count = count15m;
                } else if (count5m >= t5m) {
                    severity = 'medium'; window = '5m'; count = count5m;
                } else if (count5m >= 3) {
                    severity = 'low'; window = '5m'; count = count5m;
                }

                if (severity) {
                    const fp = crypto.createHash('sha256')
                        .update(`${orgId}:rapid_fail:account:${email}:${window}:${Math.floor(now / 300000)}`)
                        .digest('hex');

                    await AlertService.createAlert(orgId, {
                        eventId: event.id,
                        type: 'rapid_failed_logins',
                        severity,
                        fingerprint: fp,
                        title: 'Rapid Failed Logins (Account Target)',
                        description: `${count} failed login attempts for ${email} in the last ${window}. Account may be under brute-force attack.`,
                        metadata: { email, count, window, ip }
                    });
                    logger.warn({ ...logCtx, count, window, severity }, '🚨 Rapid failed logins detected on account');
                }
            }

            // ── 2. Per-IP Failure Counter (attacker-side detection) ────────────────────
            if (ip) {
                const now = Date.now();
                const ipKey5m = `fail:ip:${orgId}:${ip}:5m`;

                const ipPipe = redis.pipeline();
                ipPipe.zadd(ipKey5m, 'NX', now, `${event.id}:${now}`);
                ipPipe.zremrangebyscore(ipKey5m, 0, now - 5 * 60 * 1000);
                ipPipe.zcard(ipKey5m);
                ipPipe.expire(ipKey5m, 600);

                const ipResults = await ipPipe.exec();
                if (!ipResults) return;

                const ipCount5m = (ipResults[2]?.[1] as number) || 0;
                const ipThreshold = context.config?.ipThreshold5m ?? 10;

                if (ipCount5m >= ipThreshold) {
                    const fp = crypto.createHash('sha256')
                        .update(`${orgId}:rapid_fail:ip:${ip}:5m:${Math.floor(now / 300000)}`)
                        .digest('hex');

                    await AlertService.createAlert(orgId, {
                        eventId: event.id,
                        type: 'rapid_failed_logins_ip',
                        severity: 'high',
                        fingerprint: fp,
                        title: 'Rapid Failed Logins from Single IP',
                        description: `IP ${ip} generated ${ipCount5m} failed login attempts in the last 5 minutes across one or more accounts.`,
                        metadata: { ip, count: ipCount5m, window: '5m', email }
                    });
                }
            }

        } catch (err: any) {
            logger.error({ ...logCtx, err: err.message }, 'RapidFailedLogins module error');
        }
    }
}

export default new RapidFailedLoginsModule();
