/**
 * src/controllers/apikey.controller.ts
 * HTTP handlers for API key management (org-scoped, admin only).
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiKeyService } from '../services/apikey.service.js';
import { z } from 'zod';

const createSchema = z.object({
    rate_limit_per_minute: z.coerce.number().int().min(100).max(10000).default(1000),
});

export class ApiKeyController {
    /** GET /organizations/api-keys — list all keys for this org */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const keys = await ApiKeyService.getKeysForOrg(orgId);
        return { data: keys };
    }

    /** POST /organizations/api-keys — generate a new key */
    static async create(request: FastifyRequest, reply: FastifyReply) {
        const parsed = createSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: 'Bad Request', details: parsed.error.format() });
        }
        const orgId = request.orgId;
        const result = await ApiKeyService.generateKey(orgId, parsed.data.rate_limit_per_minute);
        return reply.code(201).send({
            rawKey: result.rawKey,
            key: result.record,
            message: 'API key generated. Store the rawKey now — it will not be shown again.',
        });
    }

    /** DELETE /organizations/api-keys/:keyId — revoke a key */
    static async revoke(request: FastifyRequest, reply: FastifyReply) {
        const { keyId } = request.params as { keyId: string };
        const orgId = request.orgId;
        console.log(`[DEBUG] Attempting to revoke keyId=${keyId} for orgId=${orgId}`);
        const { db } = await import('../db/client.js');
        const check = await db.query('SELECT organization_id FROM api_keys WHERE id = $1', [keyId]);
        if (check.rows.length > 0) {
            console.log(`[DEBUG] Found key in DB. Its orgId=${check.rows[0].organization_id}, requested by orgId=${orgId}`);
        } else {
            console.log(`[DEBUG] Key not found in DB at all.`);
        }
        await ApiKeyService.revokeKey(keyId, orgId);
        return { message: 'API key revoked successfully' };
    }
}
