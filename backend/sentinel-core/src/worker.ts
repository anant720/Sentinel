import { logger } from './lib/logger.js';
import { connectRedis, redisClient } from './lib/redis.js';
import { pool } from './db/client.js';
import { dbManager } from './db/dbManager.js';
import { reconciliationWorker } from './workers/reconciliation.worker.js';

// Booting the worker inherently registers the BullMQ loop
import './queues/event.worker.js';

/**
 * Dedicated Entrypoint for horizontally scaling Sentinel Workers
 * Completely isolates CPU-bound Redis Queue logic from the Fastify Web API.
 */
async function bootstrapWorker() {
    let bootstrapRetries = 0;
    const maxBootstrapRetries = 10;

    const runBootstrap = async () => {
        try {
            await connectRedis();

            // Try initial DB connection check
            try {
                await pool.query('SELECT 1');
                dbManager.setHealthy(true);
            } catch (err) {
                logger.error('Worker initial DB connection failed. Starting background retry loop.');
                dbManager.handleConnectionError(async () => {
                    await pool.query('SELECT 1');
                });
            }

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
            bootstrapRetries++;
            if (bootstrapRetries < maxBootstrapRetries) {
                const delay = Math.min(Math.pow(2, bootstrapRetries) * 1000, 30000);
                logger.error({ err }, `Failed to start worker. Retrying in ${delay}ms...`);
                setTimeout(runBootstrap, delay);
            } else {
                logger.error({ err }, 'Failed to start worker after maximum retries. Exiting.');
                process.exit(1);
            }
        }
    };

    runBootstrap();
}

bootstrapWorker();
