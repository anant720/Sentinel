/**
 * src/services/metrics.service.ts
 * ────────────────────────────────
 * Centralized Prometheus metrics registry for the RED observability model:
 * (Rate, Errors, Duration) across Web and Worker boundaries.
 */
import client from 'prom-client';

// Clear out global registry to ensure idempotency during hot-reloads
client.register.clear();

// Collect default Node.js V8 metrics (memory, event loop lag, CPU)
client.collectDefaultMetrics();

export class MetricsService {
    // ── 1. HTTP Telemetry ─────────────────────────────────────────────────────
    static httpRequestDuration = new client.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        // Explicit buckets tailored for an API backend (5ms through 5s)
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
    });

    static rateLimitTriggers = new client.Counter({
        name: 'rate_limit_triggers_total',
        help: 'Total number of rate limiting rejections (429s)',
        labelNames: ['route', 'ip']
    });

    static loginAttemptsTotal = new client.Counter({
        name: 'login_attempts_total',
        help: 'Total number of login attempts across all devices'
    });

    static loginSuccessTotal = new client.Counter({
        name: 'login_success_total',
        help: 'Total number of successful login events'
    });

    static loginFailuresTotal = new client.Counter({
        name: 'login_failures_total',
        help: 'Total number of failed authentication attempts',
        labelNames: ['reason'] // e.g. 'invalid_password', 'user_not_found'
    });

    static blockedRequestsTotal = new client.Counter({
        name: 'blocked_requests_total',
        help: 'Total number of HTTP requests rejected (429/403) before execution',
        labelNames: ['policy'] // 'rate_limit', 'risk_score'
    });

    static riskScoreAverage = new client.Gauge({
        name: 'risk_score_average',
        help: 'Average Real-time Threat Intelligence Risk Score mapped across domains',
        labelNames: ['entity_type']
    });

    static eventsIngestedTotal = new client.Counter({
        name: 'events_ingested_total',
        help: 'Total number of successfully ingested device telemetry events',
        labelNames: ['event_type']
    });

    static signatureFailuresTotal = new client.Counter({
        name: 'signature_failures_total',
        help: 'Total number of events rejected due to cryptographic canonical signature mismatch'
    });

    static replayAttemptsTotal = new client.Counter({
        name: 'replay_attempts_total',
        help: 'Total number of events blocked by timestamp drift or redis nonce deduplication'
    });

    // ── 2. Database Telemetry ─────────────────────────────────────────────────
    static dbQueryDuration = new client.Histogram({
        name: 'db_query_duration_seconds',
        help: 'Duration of PostgreSQL queries in seconds',
        labelNames: ['operation'], // Optional: 'select_events', 'insert_alert'
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]
    });

    // ── 3. Worker Telemetry ───────────────────────────────────────────────────
    static workerJobDuration = new client.Histogram({
        name: 'worker_job_duration_seconds',
        help: 'Duration of background BullMQ job processing',
        labelNames: ['queue_name', 'status'], // status: 'success', 'failed'
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5, 10]
    });

    static queueDepth = new client.Gauge({
        name: 'worker_queue_depth',
        help: 'Number of pending jobs in the BullMQ queue',
        labelNames: ['queue_name']
    });

    // ── 4. Detection Telemetry ────────────────────────────────────────────────
    static alertGeneration = new client.Counter({
        name: 'alerts_generated_total',
        help: 'Total number of security alerts produced by the legacy detection engine',
        labelNames: ['module_name', 'severity']
    });

    static alertsTotal = new client.Counter({
        name: 'alerts_total',
        help: 'Total number of Phase 5 security alerts generated',
        labelNames: ['rule_id', 'severity']
    });

    static detectionLatencySeconds = new client.Histogram({
        name: 'detection_latency_seconds',
        help: 'Duration of individual Phase 5 Detection Pipeline evaluations',
        labelNames: ['rule_id', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5]
    });



    // ── 5. Rule Execution Telemetry ───────────────────────────────────────────
    static ruleExecutionDuration = new client.Histogram({
        name: 'rule_execution_duration_seconds',
        help: 'Duration of individual detection rule evaluations',
        labelNames: ['module_name', 'status'], // 'success' or 'failed'
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5]
    });

    static ruleTriggers = new client.Counter({
        name: 'rule_triggers_total',
        help: 'Total number of times a detection module threshold was breached',
        labelNames: ['module_name']
    });

    static ruleErrors = new client.Counter({
        name: 'rule_errors_total',
        help: 'Total number of unexpected errors thrown during module execution',
        labelNames: ['module_name']
    });

    /**
     * Expose the core registry for formatting by the Fastify /metrics endpoint
     */
    static async getMetrics() {
        return await client.register.metrics();
    }

    static getContentType() {
        return client.register.contentType;
    }
}
