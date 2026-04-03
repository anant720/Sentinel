/**
 * src/queues/event.worker.ts
 * ──────────────────────────
 * BullMQ worker — deterministic event lifecycle processor.
 *
 * LIFECYCLE (Phase 0 — placeholder):
 *   Receive job → Fetch event (org-scoped) → Idempotency check
 *   → Mark processed=true + processed_at=NOW() → Log
 *
 * HARD RULES:
 *  - No detection logic
 *  - No plugin invocation
 *  - No alerting
 *  - No business logic
 *  - If event.processed === true → skip (idempotency guard)
 *  - DB fetch is org-scoped: WHERE id = $1 AND organization_id = $2
 */
import { Worker, Job } from 'bullmq';
import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { EventJob, getBullMQConnection } from './event.queue.js';
import { detectionEngine } from '../core/detection.engine.js';
import { redisClient } from '../lib/redis.js';
import { MetricsService } from '../services/metrics.service.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { RiskAssessmentService } from '../services/risk.service.js';
import { GeoIPService } from '../services/geoip.service.js';
import { performance } from 'perf_hooks';

// ── Processor ────────────────────────────────────────────────────────────────

async function processEvent(job: Job<EventJob>): Promise<void> {
    const { eventId, orgId } = job.data;
    const logCtx = { jobId: job.id, eventId, orgId };
    const startTime = performance.now();

    try {

        // ── 1. Fetch event (org-scoped) ───────────────────────────────────────
        const fetchResult = await db.query(
            `SELECT id, processed, event_type, device_id, payload, created_at, ip_address
         FROM events
         WHERE id = $1
           AND organization_id = $2`,
            [eventId, orgId],
        );

        const event = fetchResult.rows[0];

        if (!event) {
            // Event not found for this org — log and do not retry
            logger.warn(logCtx, 'Event not found or org mismatch — discarding job');
            return;
        }

        // ── 2. Idempotency guard ───────────────────────────────────────────────
        if (event.processed === true) {
            logger.info(logCtx, 'Event already processed — skipping (idempotent)');
            return;
        }

        // ── 3. Mark processed ─────────────────────────────────────────────────
        await db.query(
            `UPDATE events
         SET processed    = true,
             processed_at = NOW()
         WHERE id = $1
           AND organization_id = $2
           AND processed = false`,  // Additional guard: atomic conditional update
            [eventId, orgId],
        );

        logger.info(
            { ...logCtx, event_type: event.event_type, device_id: event.device_id },
            'Event lifecycle complete',
        );

        try {
            // Phase 5: Build standard Dto structure mapping dynamic fields safely
            const payload = event.payload || {};
            const detectionEvent = {
                id: event.id,
                type: event.event_type,
                timestamp: new Date(event.created_at).getTime(),
                ip: event.ip_address || payload.ip || payload.ip_address || payload.source_ip,
                email: payload.email || payload.user_email || payload.user,
                device: event.device_id,
                userAgent: payload.userAgent || payload.user_agent,
                payload: {
                    ...payload,
                    ip_address: event.ip_address || payload.ip_address,
                    location: await GeoIPService.lookup(event.ip_address || payload.ip_address || '')
                }
            };

            const context = {
                orgId,
                redis: redisClient
            };

            // ── 5. Automated Intrinsic Risk Assessment ─────────────────────────
            const riskScore = RiskAssessmentService.evaluate({ type: event.event_type, payload });
            const severity = RiskAssessmentService.getSeverity(riskScore);

            // ── 6. Update Risk Score in DB ────────────────────────────────────
            await db.query(`UPDATE events SET risk_score = $1 WHERE id = $2`, [riskScore, eventId]);

            // Execute asynchronous heuristic rule registry natively
            await detectionEngine.execute(detectionEvent, orgId);

            // ── 7. Live Broadcast (Cross-Process via Redis) ──────────────────
            await BroadcastService.publish({
                id: detectionEvent.id,
                type: detectionEvent.type,
                timestamp: detectionEvent.timestamp,
                severity,
                risk_score: riskScore,
                payload: {
                    ...detectionEvent.payload,
                    risk_score: riskScore,
                    location: detectionEvent.payload.location || null
                }
            });

            // ── 7.5 Map Stream Broadcast (Geo) ──────────────────────────────
            if (detectionEvent.payload.location && detectionEvent.payload.location.lat) {
                const geoPayload = {
                    type: detectionEvent.type,
                    ip: detectionEvent.ip,
                    lat: detectionEvent.payload.location.lat,
                    lon: detectionEvent.payload.location.lon,
                    city: detectionEvent.payload.location.city,
                    country: detectionEvent.payload.location.country,
                    country_code: detectionEvent.payload.location.countryCode,
                    rep_score: detectionEvent.payload.location.abuseScore || riskScore || 0,
                    is_threat: detectionEvent.payload.location.isThreat || severity === 'critical' || severity === 'high',
                    timestamp: detectionEvent.timestamp
                };
                await redisClient.publish(`org:${orgId}:geo_events`, JSON.stringify({ type: 'live', data: geoPayload }));
            }

            const durationInSeconds = (performance.now() - startTime) / 1000;
            MetricsService.workerJobDuration.labels('events', 'success').observe(durationInSeconds);

        } catch (err: any) {
            const durationInSeconds = (performance.now() - startTime) / 1000;
            MetricsService.workerJobDuration.labels('events', 'failed').observe(durationInSeconds);
            throw err;
        }
    } catch (err: any) {
        // Outer unhandled job fail catch if DB transactions blow up
        throw err;
    }
}

// ── Worker instance ──────────────────────────────────────────────────────────

export const eventWorker = new Worker<EventJob>(
    'event-ingestion',
    processEvent,
    {
        connection: getBullMQConnection(),
        concurrency: 5,
    },
);

eventWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed');
});

eventWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

eventWorker.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker error');
});
