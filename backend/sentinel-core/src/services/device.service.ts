/**
 * device.service.ts — Device management data layer.
 * Crypto primitives are imported from the security layer.
 * This service does NOT import crypto directly.
 */
import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { hashToken, generateSecureToken, verifyEventSignature, computeIntegrityHash } from '../security/index.js';
import { enqueueEvent } from '../queues/event.queue.js';

export class DeviceService {
    /**
     * Create a persistent enrollment token for an org.
     * Stores SHA-256 hash only — raw token returned once and discarded.
     */
    static async createEnrollmentToken(orgId: string): Promise<string> {
        const rawToken = generateSecureToken(32);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

        await db.query(
            `INSERT INTO enrollment_tokens (organization_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [orgId, tokenHash, expiresAt],
        );

        return rawToken;
    }

    /**
     * Validate token and register device.
     * Token must be scoped to the same org — cross-org enrollment is rejected.
     */
    static async registerDevice(
        orgId: string,
        enrollmentToken: string,
        name: string,
        type: string,
        publicKey: string,
    ) {
        const tokenHash = hashToken(enrollmentToken);

        const tokenResult = await db.query(
            `SELECT id, is_used, expires_at FROM enrollment_tokens
             WHERE organization_id = $1
               AND token_hash = $2`,
            [orgId, tokenHash],
        );

        if (tokenResult.rowCount === 0) {
            throw new Error('Invalid enrollment token');
        }

        const tokenRecord = tokenResult.rows[0];

        // Trap Abuse: If a token exists but is used/expired, we log an anomaly event
        if (tokenRecord.is_used || tokenRecord.expires_at < new Date()) {
            const reason = tokenRecord.is_used ? 'already_used' : 'expired';

            const eventInput = {
                failed_enrollment_reason: reason,
                token_id: tokenRecord.id,
                attempted_device_name: name,
            };
            const timestamp = Date.now();
            const hashInput = `INTERNAL_SYSTEM:enrollment_token_abuse:${timestamp}:${JSON.stringify(eventInput)}`;
            const integrityHash = computeIntegrityHash(hashInput);

            const eventResult = await db.query(
                `INSERT INTO events
                 (organization_id, device_id, event_type, payload, signature, integrity_hash, processed)
                 VALUES ($1, NULL, $2, $3, $4, $5, false)
                 RETURNING id`,
                [orgId, 'enrollment_token_abuse', eventInput, 'SYSTEM_INTERNAL', integrityHash],
            );

            await enqueueEvent(eventResult.rows[0].id, orgId);
            logger.warn({ orgId, tokenStatus: reason, deviceName: name }, 'Enrollment Token abuse rejected and mapped into Event system.');

            throw new Error(`Enrollment token is ${reason}. Security alert generated.`);
        }

        // Consume the token
        await db.query(
            'UPDATE enrollment_tokens SET is_used = true, used_at = NOW() WHERE id = $1',
            [tokenRecord.id],
        );

        const result = await db.query(
            `INSERT INTO devices (organization_id, device_name, device_type, public_key, enrollment_token)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, organization_id, device_name, created_at`,
            [orgId, name, type, publicKey, tokenHash],
        );

        return { device: result.rows[0] };
    }

    /**
     * Org-scoped device lookup.
     * Returns null for both "not found" and "wrong org" — avoids information leakage.
     */
    static async findDeviceById(orgId: string, deviceId: string) {
        const result = await db.query(
            `SELECT * FROM devices
             WHERE organization_id = $1
               AND id = $2
               AND is_active = true`,
            [orgId, deviceId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * RSA-SHA256 device signature verification.
     * Delegates entirely to security/crypto — no crypto import here.
     */
    static verifySignature(payload: string, signature: string, publicKey: string): boolean {
        return verifyEventSignature(payload, signature, publicKey);
    }
    /**
     * Heartbeat: Updates last_seen timestamp for a device.
     */
    static async heartbeat(orgId: string, deviceId: string, cpu: number, memory: number) {
        const res = await db.query(
            `UPDATE devices 
             SET last_seen = NOW()
             WHERE organization_id = $1 AND id = $2 AND is_active = true
             RETURNING id`,
            [orgId, deviceId]
        );
        return (res.rowCount ?? 0) > 0;
    }

    /**
     * List all paginated devices for an organization
     */
    static async listDevices(orgId: string, limit = 100, offset = 0) {
        const result = await db.query(
            `SELECT id, device_name, device_type, created_at, last_seen, is_active
             FROM devices
             WHERE organization_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [orgId, limit, offset]
        );
        return result.rows;
    }
}
