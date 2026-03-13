/**
 * src/services/retention.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Track 3.2: Retention Engine
 *
 * Nightly job that:
 *   1. Drops event partitions older than the org's configured retention period
 *   2. Ensures next month's partition exists before the month starts
 *   3. Exposes a manual trigger for CLI/admin use
 *
 * Default retention: 90 days (configurable per org via org.retention_days)
 */
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

const DEFAULT_RETENTION_DAYS = 90;

export class RetentionService {
    /**
     * Drop event partitions older than the configured retention period.
     * Uses the partition naming scheme: events_YYYY_MM
     */
    static async enforceRetention(retentionDays = DEFAULT_RETENTION_DAYS): Promise<void> {
        const client = await pool.connect();
        try {
            // Find all event partitions
            const res = await client.query(`
                SELECT c.relname AS partition_name
                FROM pg_class c
                JOIN pg_inherits i ON i.inhrelid = c.oid
                JOIN pg_class p ON p.oid = i.inhparent
                WHERE p.relname = 'events'
                  AND c.relkind = 'r'
                ORDER BY c.relname
            `);

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            let dropped = 0;
            for (const row of res.rows) {
                const partName: string = row.partition_name;

                // Parse partition name: events_YYYY_MM or events_overflow / events_migrated
                const match = partName.match(/^events_(\d{4})_(\d{2})$/);
                if (!match) continue;

                const partYear = parseInt(match[1]!);
                const partMonth = parseInt(match[2]!);
                // Last day of the partition month
                const partEndDate = new Date(partYear, partMonth, 1); // First of next month

                if (partEndDate < cutoffDate) {
                    logger.warn({ partName, partEndDate, cutoffDate }, `Dropping expired partition`);
                    await client.query(`DROP TABLE IF EXISTS ${partName} CASCADE`);
                    dropped++;
                }
            }

            logger.info({ dropped, retentionDays }, 'Retention enforcement complete');
        } finally {
            client.release();
        }
    }

    /**
     * Create next month's partition proactively (run at end of each month).
     * Calls the DB function installed by migration 017.
     */
    static async createNextMonthPartition(): Promise<void> {
        const client = await pool.connect();
        try {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const dateStr = nextMonth.toISOString().split('T')[0];

            await client.query(`SELECT create_events_partition_for_month($1::DATE)`, [dateStr]);
            logger.info({ nextMonth: dateStr }, 'Pre-created next month partition');
        } finally {
            client.release();
        }
    }

    /**
     * Full nightly maintenance job:
     * - Create next month's partition
     * - Drop partitions exceeding retention
     */
    static async runNightlyMaintenance(retentionDays = DEFAULT_RETENTION_DAYS): Promise<void> {
        logger.info('Starting nightly DB maintenance...');
        await RetentionService.createNextMonthPartition();
        await RetentionService.enforceRetention(retentionDays);
        logger.info('Nightly DB maintenance complete');
    }
}
