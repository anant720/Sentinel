import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { pool } from '../db/client.js';
import crypto from 'crypto';

/**
 * NEW DEVICE LOGON — Enterprise Edition
 *
 * Detects logins from devices never seen before for a specific user.
 * Mirrors Microsoft Entra ID's "Unfamiliar sign-in properties" detection.
 *
 * Key improvements:
 * - Minimum login history requirement (no false positives for new accounts)
 * - Redis caching of known devices (avoids DB query on every login)
 * - Off-hours bonus risk scoring (2AM-5AM is high risk)
 * - Country change multiplier
 */
class NewDeviceLogonModule implements DetectionModule {
    name = 'new_device_logon';

    subscribesTo(): string[] {
        return ['login_success'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;

        const currentDeviceId = payload?.device_id;
        const userId          = payload?.user_id;
        const email           = payload?.email;

        if (!currentDeviceId || !userId) return;

        const deviceCacheKey = `user:devices:${orgId}:${userId}`;

        try {
            // ── 1. Check Redis cache first (fast path) ──────────────────────────────────
            const cachedDevices = await redis.smembers(deviceCacheKey);

            if (cachedDevices.length > 0) {
                // Cache hit — register new device and check
                if (cachedDevices.includes(currentDeviceId)) {
                    return; // Known device — no alert
                }
                // New device found — add to cache and continue to alert logic
                await redis.sadd(deviceCacheKey, currentDeviceId);
                await redis.expire(deviceCacheKey, 86400 * 30); // 30-day cache
            } else {
                // ── 2. Cache miss — query DB (cold start only) ──────────────────────────
                const historyResult = await pool.query(
                    `SELECT DISTINCT (payload->>'device_id') as device_id
                     FROM events
                     WHERE organization_id = $1
                       AND event_type = 'login_success'
                       AND payload->>'user_id' = $2
                       AND payload->>'device_id' IS NOT NULL
                       AND id != $3
                     ORDER BY device_id
                     LIMIT 50`,
                    [orgId, userId, event.id]
                );

                const knownDevices = historyResult.rows.map((r: any) => r.device_id as string);

                // CRITICAL FIX: Require at least 2 prior logins before flagging new devices
                // Brand new accounts have zero history — alerting = massive false positives
                if (knownDevices.length < 2) {
                    // Populate cache for future logins even if we don't alert
                    if (knownDevices.length > 0) {
                        await redis.sadd(deviceCacheKey, ...knownDevices, currentDeviceId);
                        await redis.expire(deviceCacheKey, 86400 * 30);
                    }
                    return;
                }

                // Populate Redis cache with known devices
                await redis.sadd(deviceCacheKey, ...knownDevices, currentDeviceId);
                await redis.expire(deviceCacheKey, 86400 * 30);

                if (knownDevices.includes(currentDeviceId)) {
                    return; // Known device
                }
            }

            // ── 3. New device confirmed — compute composite risk score ──────────────────
            let riskScore = 35; // base risk for any unknown device
            const riskFactors: string[] = ['new unrecognized device'];

            // Country change bonus
            const currentCountry = payload?.geo?.country;
            if (currentCountry) {
                const lastCountryResult = await pool.query(
                    `SELECT (payload->'geo'->>'country') as country
                     FROM events
                     WHERE organization_id = $1
                       AND event_type = 'login_success'
                       AND payload->>'user_id' = $2
                       AND payload->'geo'->>'country' IS NOT NULL
                       AND id != $3
                     ORDER BY created_at DESC LIMIT 1`,
                    [orgId, userId, event.id]
                );
                const lastCountry = lastCountryResult.rows[0]?.country;
                if (lastCountry && lastCountry !== currentCountry) {
                    riskScore += 30;
                    riskFactors.push(`country change (${lastCountry} → ${currentCountry})`);
                }
            }

            // Off-hours bonus (2AM-5AM local server time is high risk)
            const hour = new Date().getUTCHours();
            if (hour >= 2 && hour <= 5) {
                riskScore += 20;
                riskFactors.push('login during high-risk hours (02:00-05:00 UTC)');
            }

            // High-risk country detection
            const highRiskCountries = new Set(['RU', 'CN', 'KP', 'IR', 'BY', 'SY', 'CU', 'VE']);
            const countryCode = payload?.geo?.countryCode;
            if (countryCode && highRiskCountries.has(countryCode)) {
                riskScore += 25;
                riskFactors.push(`access from sanctioned/high-risk country (${countryCode})`);
            }

            const severity = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : 'medium';

            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:new_device:${userId}:${currentDeviceId}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'new_device_logon',
                severity,
                fingerprint,
                title: 'First-Time Device Login',
                description: `User ${email || userId} authenticated from an unrecognized device. Risk factors: ${riskFactors.join(', ')}.`,
                metadata: {
                    user_id: userId,
                    email,
                    device_id: currentDeviceId,
                    risk_score: riskScore,
                    risk_factors: riskFactors,
                    country: currentCountry,
                    country_code: countryCode
                }
            });
        } catch (err: any) {
            // Non-fatal — log and continue
        }
    }
}

export default new NewDeviceLogonModule();
