import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * DISTRIBUTED LOGIN (Botnet Brute Force) — Enterprise Edition
 *
 * Detects many DIFFERENT IPs targeting the SAME account — the hallmark of
 * botnet-driven credential stuffing attacks.
 *
 * Uses true sliding windows (sorted sets) and adds country-diversity scoring:
 * IPs from different continents indicate a sophisticated botnet, not a local ISP issue.
 */
class DistributedLoginModule implements DetectionModule {
    name = 'distributed_login';

    subscribesTo(): string[] {
        return ['login_failed', 'login_failure'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Distributed Brute Force',
            description: 'Many IPs targeting one account — the botnet/credential-stuffing pattern. Country-diversity scoring: 5+ countries = global botnet = Critical severity.',
            icon: 'hub',
            category: 'identity' as const,
            configFields: [
                { key: 'threshold', label: 'Unique IPs (10 min)', default: 4 },
            ],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;
        const ip    = event.payload?.ip_address || event.payload?.ip;
        const country = event.payload?.geo?.country || event.geo_country || null;

        if (!email || !ip) return;

        const now = Date.now();

        // Sliding 10-minute window: track unique IPs attacking this account
        const ipSetKey  = `attack:distributed:${orgId}:${email}:ips`;
        const timeKey   = `attack:distributed:${orgId}:${email}:times`;
        const countryKey = `attack:distributed:${orgId}:${email}:countries`;

        const pipe = redis.pipeline();

        // Track unique IPs in sliding 10m window
        pipe.zadd(timeKey, 'NX', now, `${ip}:${now}`);
        pipe.zremrangebyscore(timeKey, 0, now - 10 * 60 * 1000);
        pipe.zcard(timeKey);
        pipe.expire(timeKey, 1200);

        // Track unique IPs (set for deduplication)
        pipe.sadd(ipSetKey, ip);
        pipe.scard(ipSetKey);
        pipe.expire(ipSetKey, 1200);

        // Track unique countries for botnet sophistication scoring
        if (country) {
            pipe.sadd(countryKey, country);
            pipe.scard(countryKey);
            pipe.expire(countryKey, 1200);
        }

        const results = await pipe.exec();
        if (!results) return;

        const uniqueIps10m   = (results[2]?.[1] as number) || 0;
        const totalUniqueIps = (results[5]?.[1] as number) || 0;
        const uniqueCountries = country ? ((results[8]?.[1] as number) || 0) : 0;

        const threshold = context.config?.threshold ?? 4;

        if (uniqueIps10m < threshold) return;

        // Country diversity scoring — cross-continent = more sophisticated = critical
        let severity: 'high' | 'critical' = 'high';
        let sophistication = 'concentrated';

        if (uniqueCountries >= 5) {
            severity = 'critical';
            sophistication = 'global botnet (5+ countries)';
        } else if (uniqueCountries >= 3) {
            severity = 'critical';
            sophistication = 'multi-region distributed attack';
        } else if (uniqueIps10m >= threshold * 3) {
            severity = 'critical';
            sophistication = 'high-volume concentrated burst';
        }

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:distributed_login:${email}:${Math.floor(now / 600000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'distributed_login',
            severity,
            fingerprint,
            title: 'Distributed Brute Force Attack',
            description: `${uniqueIps10m} unique IPs targeted account ${email} within 10 minutes. Sophistication: ${sophistication}.`,
            metadata: {
                email,
                unique_ips_10m: uniqueIps10m,
                total_unique_ips: totalUniqueIps,
                unique_countries: uniqueCountries,
                sophistication,
                window: '10m'
            }
        });
    }
}

export default new DistributedLoginModule();
