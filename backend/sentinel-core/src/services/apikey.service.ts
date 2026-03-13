import * as crypto from 'crypto';
import { db } from '../db/client.js';

export interface ApiKeyRecord {
    id: string;
    organization_id: string;
    key_hash: string;
    prefix: string;
    rate_limit_per_minute: number;
    monthly_event_quota: number;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
}

export class ApiKeyService {
    /**
     * Generates a new API Key for the specific organization.
     * Returns the RAW secret string solely once, alongside the persistent DB record.
     */
    static async generateKey(organizationId: string, rateLimit: number = 1000): Promise<{ rawKey: string; record: ApiKeyRecord }> {
        // Generate 32 bytes of high entropy
        const entropy = crypto.randomBytes(32).toString('base64url');
        const rawKey = `sk_sentinel_${entropy}`;

        // Extract a displayable prefix mapping back to the dashboard securely
        const prefix = rawKey.substring(0, 16);

        // Generate the SHA-256 fingerprint exactly identical to how password hashes operate
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const query = `
            INSERT INTO api_keys (organization_id, key_hash, prefix, rate_limit_per_minute)
            VALUES ($1, $2, $3, $4)
            RETURNING id, organization_id, key_hash,
                      prefix AS key_prefix,
                      rate_limit_per_minute, monthly_event_quota,
                      created_at, last_used_at, revoked_at,
                      (revoked_at IS NULL) AS is_active
        `;

        const { rows } = await db.query(query, [organizationId, keyHash, prefix, rateLimit]);

        return { rawKey, record: rows[0] as ApiKeyRecord };
    }

    /**
     * Look up and explicitly validate a supplied raw header token mathematically against the DB.
     */
    static async validateKey(rawKey: string): Promise<ApiKeyRecord | null> {
        if (!rawKey.startsWith('sk_sentinel_')) return null;

        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const query = `
            SELECT id, organization_id, key_hash, prefix, rate_limit_per_minute, monthly_event_quota, created_at, last_used_at, revoked_at
            FROM api_keys
            WHERE key_hash = $1 AND revoked_at IS NULL
        `;

        const { rows } = await db.query(query, [keyHash]);

        if (rows.length === 0) return null;

        const record = rows[0] as ApiKeyRecord;

        // Fire-and-forget: Bump last_used_at timestamp.
        db.query(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`, [record.id]).catch(err => {
            // Background update failures shouldn't block validation bounds
        });

        return record;
    }

    static async revokeKey(keyId: string, organizationId: string): Promise<void> {
        console.log(`[REVOKE] keyId=${keyId}, organizationId=${organizationId}`);
        const debugRecord = await db.query('SELECT id, organization_id, revoked_at FROM api_keys WHERE id = $1', [keyId]);
        console.log(`[REVOKE DEBUG] DB Record before update:`, debugRecord.rows[0]);
        const query = `
            UPDATE api_keys 
            SET revoked_at = CURRENT_TIMESTAMP 
            WHERE id = $1 AND revoked_at IS NULL
        `;
        const res = await db.query(query, [keyId]);
        console.log(`[REVOKE RESULT] Rows updated: ${res.rowCount}`);
    }

    static async getKeysForOrg(organizationId: string): Promise<ApiKeyRecord[]> {
        const query = `
            SELECT id, organization_id, key_hash,
                   prefix AS key_prefix,
                   rate_limit_per_minute, monthly_event_quota,
                   created_at, last_used_at, revoked_at,
                   (revoked_at IS NULL) AS is_active
            FROM api_keys
            WHERE organization_id = $1
            ORDER BY created_at DESC
        `;
        const { rows } = await db.query(query, [organizationId]);
        return rows as ApiKeyRecord[];
    }
}
