import { PluginLoader } from './plugin-loader.js';
import { DetectionContext } from './detection.types.js';
import { logger } from '../lib/logger.js';
import { FastifyInstance } from 'fastify';
import { AlertService, AlertPayload } from '../services/alert.service.js';
import { db } from '../lib/database.js';
import { MetricsService } from '../services/metrics.service.js';
import { performance } from 'perf_hooks';
import { redisClient } from '../lib/redis.js';

export class DetectionEngine {
    private pluginLoader: PluginLoader;

    constructor() {
        this.pluginLoader = new PluginLoader();
    }

    /**
     * Bootstraps the engine by loading all available modules.
     */
    async initialize(fastify?: FastifyInstance) {
        await this.pluginLoader.loadModules(fastify);
        logger.info(`Detection Engine initialized with ${this.pluginLoader.getAllModules().length} modules.`);
    }

    /**
     * The core execution harness.
     * Takes a fully materialized event and routes it to subscribed plugins.
     */
    async execute(event: any, orgId: string): Promise<void> {
        const modules = this.pluginLoader.getAllModules();
        const eventType = event.event_type;

        const executeSubscribers = modules.filter(
            (mod) => mod.subscribesTo().includes('*') || mod.subscribesTo().includes(eventType)
        );

        if (executeSubscribers.length === 0) return;

        logger.debug({ eventId: event.id, subscriberCount: executeSubscribers.length }, 'Routing event to detection modules');

        // 1. Hydrate tenant-specific config overrides
        const configResult = await db.query(
            `SELECT module_id, enabled, config 
             FROM organization_detection_settings 
             WHERE organization_id = $1 AND module_id = ANY($2)`,
            [orgId, executeSubscribers.map(m => m.name)]
        );
        const configs = new Map(configResult.rows.map(r => [r.module_id, r]));

        // 2. Discard disabled modules
        const runnableModules = executeSubscribers.filter(mod => {
            const orgConfig = configs.get(mod.name);
            return orgConfig ? orgConfig.enabled : true; // Default to true if unconfigured
        });

        // 3. Concurrency Semaphore (imitating p-limit)
        async function runWithLimit<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> {
            const results: PromiseSettledResult<T>[] = [];
            let i = 0;
            const workers = Array.from({ length: limit }, async () => {
                while (i < tasks.length) {
                    const index = i++;
                    try {
                        const task = tasks[index];
                        if (!task) continue;
                        const value = await task();
                        results[index] = { status: 'fulfilled', value };
                    } catch (reason) {
                        results[index] = { status: 'rejected', reason };
                    }
                }
            });
            await Promise.all(workers);
            return results;
        }

        // 4. Wrap execution with Prometheus context metrics
        const tasks = runnableModules.map(mod => async () => {
            const orgConfig = configs.get(mod.name);
            const context: DetectionContext = {
                orgId,
                event,
                config: orgConfig?.config,
                redis: redisClient
            };
            const start = performance.now();

            try {
                await mod.execute(context);
                const duration = (performance.now() - start) / 1000;
                MetricsService.ruleExecutionDuration.labels(mod.name, 'success').observe(duration);
            } catch (err) {
                const duration = (performance.now() - start) / 1000;
                MetricsService.ruleExecutionDuration.labels(mod.name, 'failed').observe(duration);
                MetricsService.ruleErrors.labels(mod.name).inc();

                // Bubble the error up to the engine logger
                throw err;
            }
        });

        // 5. Execute bounded thread pool (max 5 concurrent evaluations per event)
        const results = await runWithLimit(5, tasks);

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const pluginName = runnableModules[index]?.name || 'UnknownPlugin';
                logger.error(
                    { err: result.reason, plugin: pluginName },
                    'Detection module execution failed ungracefully'
                );
            }
        });
    }
}

// Export a singleton instance for global use
export const detectionEngine = new DetectionEngine();
