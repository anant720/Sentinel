/**
 * src/controllers/ingestion.controller.ts
 * ────────────────────────────────────────
 * HTTP boundary for event ingestion.
 *
 * Responsibilities:
 *  - Parse and HTTP-validate inbound request
 *  - Verify device exists and is scoped to req.orgId
 *  - Verify cryptographic signature
 *  - Forward to IngestionService (which runs its own strict Zod schema)
 *
 * Authorization is handled by permission middleware upstream.
 * Org isolation is applied by orgIsolationMiddleware upstream.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { IngestionService } from '../services/ingestion.service.js';
import { DeviceService } from '../services/device.service.js';
import { z } from 'zod';
import { redisClient } from '../lib/redis.js';
import { MetricsService } from '../services/metrics.service.js';

/** 
 * Phase 4: Canonical Event Envelope 
 * The signature must cover the entire `event` object, not just the payload.
 */
const ingestSchema = z.object({
    event: z.object({
        device_id: z.string().uuid(),
        event_type: z.string().min(1),
        timestamp: z.number().int().positive(),
        nonce: z.string().uuid(),
        payload: z.union([z.record(z.unknown()), z.string()])
    }),
    signature: z.string().min(1),
});

export class IngestionController {
    static async ingest(request: FastifyRequest, reply: FastifyReply) {
        // ── 1. HTTP-level validation ──────────────────────────────────────
        const validation = ingestSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({
                error: 'Bad Request',
                details: validation.error.format(),
            });
        }

        const { event, signature } = validation.data;
        const payload = (event.payload as Record<string, string | number | boolean>) || {};
        const entity = payload.email || payload.user_email || payload.user || request.ip;
        const riskKey = `risk:account:${request.orgId}:${entity}`;

        // ── 1b. Adaptive Risk Scoring & Rate Limiting ────────────────────────
        const currentRiskStr = await redisClient.get(riskKey);
        const currentRisk = parseInt(currentRiskStr || '0', 10);

        if (currentRisk >= 100) {
            return reply.code(429).send({ error: 'Too Many Requests', message: 'Critical Risk: Entity conditionally blocked dynamically by API limits' });
        }

        let allowedRate = 100; // Low Risk
        if (currentRisk >= 50) allowedRate = 10; // High Risk
        else if (currentRisk >= 10) allowedRate = 50; // Medium Risk

        const rateKey = `ratelimit:adaptive:${request.orgId}:${entity}`;
        const pipeline = redisClient.pipeline();
        pipeline.incr(rateKey);
        pipeline.expire(rateKey, 60, 'NX');
        const rateRes = await pipeline.exec();

        let reqCount = 0;
        if (rateRes && rateRes[0]) {
            reqCount = rateRes[0][1] as number;
        }

        if (reqCount > allowedRate) {
            return reply.code(429).send({ error: 'Too Many Requests', message: `Adaptive Rate Limiter: Maximum limit of ${allowedRate}/min exceeded` });
        }

        // ── 2a. Temporal Drift Validation (Replay Protection) ─────────────
        const driftMs = Math.abs(Date.now() - event.timestamp);
        if (driftMs > 60000) {
            MetricsService.replayAttemptsTotal.inc();
            // Increase Risk natively immediately
            await redisClient.incrby(riskKey, 40);
            return reply.code(400).send({
                error: 'Bad Request',
                message: 'Event timestamp drift exceeded maximum allowed window of 60 seconds.'
            });
        }

        // ── 2b. Nonce Replay Cache (Replay Protection) ────────────────────
        const nonceKey = `nonce:${event.device_id}:${event.nonce}`;
        const isUnique = await redisClient.set(nonceKey, "1", "EX", 120, "NX");
        if (!isUnique) {
            MetricsService.replayAttemptsTotal.inc();
            await redisClient.incrby(riskKey, 40);
            return reply.code(401).send({
                error: 'Unauthorized',
                message: 'Event replay detected. Nonce has already been consumed.'
            });
        }

        // ── 2c. Device lookup (org-scoped — cross-org returns null) ───────
        const device = await DeviceService.findDeviceById(request.orgId, event.device_id);
        if (!device) {
            return reply.code(404).send({ error: 'Not Found', message: 'Device not found or inactive' });
        }

        if (device.revoked) {
            return reply.code(403).send({ error: 'Forbidden', message: 'Device has been permanently revoked by an administrator.' });
        }

        // ── 3. Canonical Signature verification ───────────────────────────
        // We must sort the keys identical to the Python agent: sort_keys=True
        const canonicalDict = Object.fromEntries(
            Object.keys(event).sort().map(key => [key, (event as any)[key]])
        );
        // Stringify without whitespace
        const canonical = JSON.stringify(canonicalDict);

        const isValid = DeviceService.verifySignature(canonical, signature, device.public_key);
        if (!isValid) {
            MetricsService.signatureFailuresTotal.inc();
            await redisClient.incrby(riskKey, 30);
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid canonical event signature' });
        }

        // ── 4. Forward to service
        try {
            // Enhanced IP Resolution: Prefer request.ip but fallback to payload if request.ip is loopback/missing
            let clientIp = request.ip;
            if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
                clientIp = (payload.ip_address as string) || (payload.ip as string) || request.ip;
            }

            const result = await IngestionService.ingest(request.orgId, {
                event,
                signature,
            }, clientIp);
            MetricsService.eventsIngestedTotal.labels(event.event_type).inc();
            return reply.code(202).send({ message: 'Event accepted', event_id: result.id });
        } catch (err: unknown) {
            const e = err as { statusCode?: number; validationErrors?: unknown; message: string };
            if (e.statusCode === 400) {
                return reply.code(400).send({ error: 'Bad Request', details: e.validationErrors });
            }
            throw err; // Let the global error handler deal with unexpected errors
        }
    }

    /**
     * Protected API: List all events for Dashboard
     */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const query = request.query as { limit?: string; offset?: string; type?: string };
        const limit = parseInt(query.limit || '100', 10);
        const offset = parseInt(query.offset || '0', 10);

        // Dynamic importing db to avoid circular deps if any in controller context
        const { db } = await import('../lib/database.js');

        let sql = `
            SELECT 
                e.id, 
                e.event_type, 
                e.payload, 
                e.timestamp, 
                e.ip_address,
                e.geo_country,
                e.geo_city,
                e.geo_lat,
                e.geo_lon,
                d.device_name
            FROM events e
            LEFT JOIN devices d ON e.device_id = d.id
            WHERE e.organization_id = $1
        `;
        const params: any[] = [request.orgId];

        if (query.type && query.type !== 'all') {
            params.push(query.type);
            sql += ` AND e.event_type = $2`;
            sql += ` ORDER BY e.timestamp DESC LIMIT $3 OFFSET $4`;
            params.push(limit, offset);
        } else {
            sql += ` ORDER BY e.timestamp DESC LIMIT $2 OFFSET $3`;
            params.push(limit, offset);
        }

        const result = await db.query(sql, params);
        return reply.code(200).send({ data: result.rows });
    }
}
