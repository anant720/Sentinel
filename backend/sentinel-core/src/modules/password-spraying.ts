import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class PasswordSprayingModule implements DetectionModule {
    name = 'password_spraying';

    subscribesTo(): string[] {
        return ['login_failure'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;
        const ip = event.payload?.ip_address || event.payload?.ip;

        if (!email || !ip) return;

        const setKey = `attack:ip:${orgId}:${ip}:accounts`;

        const pipeline = redis.pipeline();
        pipeline.sadd(setKey, email);
        pipeline.expire(setKey, 300, 'NX'); // 5 minutes window
        pipeline.scard(setKey);

        const results = await pipeline.exec();
        if (!results) return;

        const uniqueAccountsCount = (results[2]?.[1] as number) || 0;
        const threshold = context.config?.threshold || 10;

        if (uniqueAccountsCount >= threshold) {
            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:password_spraying:${ip}:${Math.floor(Date.now() / 600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'password_spraying',
                severity: 'high',
                fingerprint,
                title: 'Password Spraying Attack',
                description: `IP ${ip} targeted ${uniqueAccountsCount} unique accounts with failed logins within 5 minutes.`,
                metadata: {
                    ip,
                    account_count: uniqueAccountsCount,
                    window: '5m'
                }
            });
        }
    }
}

export default new PasswordSprayingModule();
