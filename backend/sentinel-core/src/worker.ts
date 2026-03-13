import { logger } from './lib/logger.js';
import { connectRedis, redisClient } from './lib/redis.js';
import { pool } from './db/client.js';
import { reconciliationWorker } from './workers/reconciliation.worker.js';

// Booting the worker inherently registers the BullMQ loop
import './queues/event.worker.js';

/**
 * Dedicated Entrypoint for horizontally scaling Sentinel Workers
 * Completely isolates CPU-bound Redis Queue logic from the Fastify Web API.
 */
async function bootstrapWorker() {
    try {
        await connectRedis();

        // Start the continuous background polling array
        reconciliationWorker.start();

        logger.info('🚀 Sentinel Core Worker started natively via standalone execution profile');

        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                logger.info(`Received ${signal}, shutting down worker queue gracefully…`);
                try {
                    reconciliationWorker.stop();
                    await redisClient.quit();
                    await pool.end();
                    logger.info('Worker DB constraints closed cleanly. Goodbye!');
                } finally {
                    process.exit(0);
                }
            });
        });
    } catch (err) {
        logger.error({ err }, 'Failed to start structurally isolated worker');
        process.exit(1);
    }
}

bootstrapWorker();
