import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class DistributedLoginModule implements DetectionModule {
    name = 'distributed_login';

    subscribesTo(): string[] {
        return ['login_failure'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;
        const ip = event.payload?.ip_address || event.payload?.ip;

        if (!email || !ip) return;

        const setKey = `attack:account:${orgId}:${email}:ips`;

        const pipeline = redis.pipeline();
        pipeline.sadd(setKey, ip);
        pipeline.expire(setKey, 300, 'NX'); // 5 minutes window
        pipeline.scard(setKey);

        const results = await pipeline.exec();
        if (!results) return;

        const uniqueIpsCount = (results[2]?.[1] as number) || 0;
        const threshold = context.config?.threshold || 5;

        if (uniqueIpsCount >= threshold) {
            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:distributed_login:${email}:${Math.floor(Date.now() / 600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'distributed_login',
                severity: 'critical',
                fingerprint,
                title: 'Distributed Brute Force Attack',
                description: `Detected ${uniqueIpsCount} unique IPs targeting account ${email} within 5 minutes.`,
                metadata: {
                    email,
                    unique_ip_count: uniqueIpsCount,
                    window: '5m'
                }
            });
        }
    }
}

export default new DistributedLoginModule();
