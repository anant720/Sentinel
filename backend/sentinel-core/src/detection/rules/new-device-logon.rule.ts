import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';
import { db } from '../../lib/database.js';

/**
 * New Device / Browser Logon Detection
 *
 * Every successful login carries a device_id (SHA-256 fingerprint of browser signals).
 * This rule checks if the provided device_id has ever been seen before for this user.
 * If it's brand new, it fires a high-severity alert, as this is the primary signal
 * for credential stuffing and account takeover attacks.
 *
 * Risk Scoring:
 *   +40  — Device fingerprint never seen before
 *   +30  — Login originates from a different country than the user's last known country
 *   = 70 total (HIGH severity) for a foreign new device
 */
export const newDeviceLogonRule: DetectionRule = {
    id: 'new_device_logon',
    description: 'New Device / Browser Login',

    evaluate: async (event: DetectionEvent, context: DetectionContext): Promise<DetectionAlert | null> => {
        // Only trigger on successful or attempted logins
        if (event.type !== 'login_success' && event.type !== 'login_attempt') {
            return null;
        }

        const payload = event.payload as any;

        // We need a device_id to operate. If it's missing, bail silently.
        const currentDeviceId: string | null = payload?.device_id ?? null;
        const userId: string | null = payload?.user_id ?? null;

        if (!currentDeviceId || !userId) return null;

        // ── 1. Look up all historical device_ids for this user ─────────────────
        const historyResult = await db.query(
            `SELECT DISTINCT (payload->>'device_id') as device_id
             FROM events
             WHERE organization_id = $1
               AND event_type = 'login_success'
               AND payload->>'user_id' = $2
               AND payload->>'device_id' IS NOT NULL
               AND id != $3
             LIMIT 50`,
            [context.orgId, userId, event.id]
        );

        const knownDevices = new Set(
            historyResult.rows
                .map((r: any) => r.device_id)
                .filter(Boolean)
        );

        // ── 2. If device has been seen before, no action needed ─────────────────
        if (knownDevices.has(currentDeviceId)) return null;

        // ── 3. Calculate composite risk score ───────────────────────────────────
        let riskScore = 40; // Base: new device

        // Bonus risk if country differs from the user's last known country
        const lastLoginResult = await db.query(
            `SELECT geo_country FROM events
             WHERE organization_id = $1
               AND event_type = 'login_success'
               AND payload->>'user_id' = $2
               AND geo_country IS NOT NULL
               AND id != $3
             ORDER BY created_at DESC
             LIMIT 1`,
            [context.orgId, userId, event.id]
        );

        const lastCountry = lastLoginResult.rows[0]?.geo_country ?? null;
        const currentCountry = payload?.geo_country ?? null;

        if (lastCountry && currentCountry && lastCountry !== currentCountry) {
            riskScore += 30; // geo mismatch → likely international attacker
        }

        const severity = riskScore >= 60 ? 'high' : 'medium';

        // ── 4. Return framework alert ───────────────────────────────────────────
        const knownCount = knownDevices.size;
        const description = knownCount === 0
            ? `First-ever login from this device for user ${payload.email ?? userId}. No device history exists.`
            : [
                `Login from an unrecognized device for ${payload.email ?? userId}.`,
                `${knownCount} known device(s) on record.`,
                lastCountry && currentCountry && lastCountry !== currentCountry
                    ? ` Country changed: ${lastCountry} → ${currentCountry}.`
                    : ''
              ].join(' ').trim();

        return {
            ruleId: 'new_device_logon',
            severity,
            entity: payload.email ?? userId,
            evidence: {
                description,
                device_id: currentDeviceId,
                known_devices_count: knownCount,
                risk_score: riskScore,
                last_country: lastCountry,
                current_country: currentCountry
            }
        };
    },
};
