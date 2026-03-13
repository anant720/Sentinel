/**
 * org.service.ts — Organization management data layer.
 * Crypto primitives are imported from the security layer.
 * This service does NOT import crypto directly.
 */
import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { generateSecureToken, hashToken } from '../security/index.js';

export class OrgService {
    static async createOrganization(name: string, slug: string) {
        const apiKey = `sk_${generateSecureToken(24)}`;
        const apiKeyHash = hashToken(apiKey);

        const result = await db.query(
            `INSERT INTO organizations (name, slug, api_key_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, slug, created_at`,
            [name, slug, apiKeyHash],
        );

        return {
            organization: result.rows[0],
            apiKey, // Plain key returned only once at creation
        };
    }

    /**
     * Fetch org by ID, scoped to the requesting org (orgId from JWT).
     * Users can only read their own org's record.
     */
    static async getOrganizationById(orgId: string, id: string) {
        const result = await db.query(
            `SELECT id, name, slug, plan_type, is_active, created_at
             FROM organizations
             WHERE organization_id = $1
               AND id = $2`,
            [orgId, id],
        );
        return result.rows[0] ?? null;
    }

    static async verifyApiKey(apiKey: string) {
        const hash = hashToken(apiKey);
        const result = await db.query(
            'SELECT id FROM organizations WHERE api_key_hash = $1 AND is_active = true',
            [hash],
        );
        return result.rows[0] ?? null;
    }
}
