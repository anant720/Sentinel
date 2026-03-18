import { rules } from './registry.js';
import { DetectionEvent, DetectionContext, DetectionAlert } from './types.js';
import { logger } from '../lib/logger.js';
import { db } from '../lib/database.js';
import { AlertService } from '../services/alert.service.js';
import { MetricsService } from '../services/metrics.service.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { performance } from 'perf_hooks';

export class DetectionEngine {

    /**
     * The core execution harness for Phase 5.
     * Takes a fully materialized DetectionEvent and routes it through the Registry rules.
     */
    async execute(event: DetectionEvent, context: DetectionContext): Promise<void> {
        // ── 1. Hydrate tenant-specific config overrides ──
        const configResult = await db.query(
            `SELECT module_id, enabled, config 
             FROM organization_detection_settings 
             WHERE organization_id = $1`,
            [context.orgId]
        );
        const configs = new Map(configResult.rows.map((r: any) => [r.module_id, r]));

        logger.debug({ eventId: event.id, rulesCount: rules.length }, 'Routing event to detection registry');

        for (const rule of rules) {
            // ── 2. Discard disabled modules ──
            const orgConfig = configs.get(rule.id);
            const isEnabled = orgConfig ? (orgConfig as any).enabled : true;

            if (!isEnabled) {
                logger.debug({ ruleId: rule.id, orgId: context.orgId }, 'Skipping disabled detection rule');
                continue;
            }

            // ── 3. Inject tenant-specific config ──
            const ruleContext: DetectionContext = {
                ...context,
                config: (orgConfig as any)?.config
            };

            const start = performance.now();
            try {
                const alert: DetectionAlert | null = await rule.evaluate(event, ruleContext);

                const duration = (performance.now() - start) / 1000;
                MetricsService.ruleExecutionDuration.labels(rule.id, 'success').observe(duration);

                if (alert) {
                    logger.warn({
                        eventId: event.id,
                        orgId: context.orgId,
                        rule: alert.ruleId,
                        entity: alert.entity,
                        severity: alert.severity,
                        evidence: alert.evidence
                    }, '🚨 Detection Rule triggered an Alert!');

                    // Persist Alert dynamically natively to PostgreSQL
                    const alertRecord = await AlertService.createAlert(context.orgId, {
                        eventId: event.id,
                        type: alert.ruleId,
                        title: `Security Alert: ${alert.ruleId}`,
                        description: `Entity ${alert.entity} triggered rule ${alert.ruleId}`,
                        severity: alert.severity,
                        entity: alert.entity,
                        evidence: alert.evidence,
                        metadata: { entity: alert.entity, evidence: alert.evidence },
                        fingerprint: `${alert.ruleId}:${alert.entity}:${Math.floor(Date.now() / 60000)}`
                    });

                    // ── Broadcast Alert for Real-time Dashboards (Cross-Process via Redis) ──
                    if (alertRecord) {
                        await BroadcastService.publish({
                            id: alertRecord.id,
                            type: alertRecord.type,
                            timestamp: alertRecord.created_at.getTime(),
                            severity: alertRecord.severity,
                            risk_score: 50, // Default for engine-triggered alerts
                            payload: alertRecord.evidence
                        });
                    }

                    // Add new metric mapping
                    // MetricsService.alertsGeneratedTotal.inc({ rule: alert.ruleId, severity: alert.severity });
                }
            } catch (err) {
                const duration = (performance.now() - start) / 1000;
                MetricsService.ruleExecutionDuration.labels(rule.id, 'failed').observe(duration);
                MetricsService.ruleErrors.labels(rule.id).inc();
                logger.error({ err, rule: rule.id }, 'Detection rule execution failed');
            }
        }
    }
}

// Export a singleton instance
export const detectionEngine = new DetectionEngine();
