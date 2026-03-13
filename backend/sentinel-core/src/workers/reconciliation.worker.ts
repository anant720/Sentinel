import { db } from '../lib/database.js';
import { enqueueEvent } from '../queues/event.queue.js';
import { logger } from '../lib/logger.js';

export class ReconciliationWorker {
    private intervalId: NodeJS.Timeout | undefined;

    start() {
        if (this.intervalId) return;

        // Run deeply isolated reconciliation every 30 seconds globally
        this.intervalId = setInterval(() => this.reconcile(), 30000);
        logger.info('Queue Reconciliation Worker started');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            logger.info('Queue Reconciliation Worker stopped');
        }
    }

    private async reconcile() {
        try {
            // Reconcile events older than 60 seconds that are still processed=false
            const result = await db.query(`
                SELECT id, organization_id 
                FROM events 
                WHERE processed = false 
                  AND created_at < NOW() - INTERVAL '1 minute'
                LIMIT 1000
            `);

            const rows = result.rows;
            if (rows.length === 0) return;

            logger.warn({ count: rows.length }, 'Reconciling dropped events deeply natively. Pushing back onto BullMQ...');

            for (const row of rows) {
                await enqueueEvent(row.id, row.organization_id);
            }
        } catch (err: any) {
            logger.error({ err: err.message }, 'Reconciliation logic failed structurally');
        }
    }
}

export const reconciliationWorker = new ReconciliationWorker();
