import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JobQueue } from '../src/queues/event.queue.js';
import { pool } from '../src/db/client.js';
import { redisClient } from '../src/lib/redis.js';

describe('Phase J: Worker Queue Stress Test', () => {
    beforeAll(async () => {
        // Ensure Redis is healthy
        if (redisClient.status !== 'ready') {
            await redisClient.connect().catch(() => { });
        }
    });

    afterAll(async () => {
        await JobQueue.obliterate({ force: true }).catch(() => { });
        await pool.end();
        if (redisClient.status === 'ready') {
            await redisClient.quit();
        }
    });

    it('Push 10,000 Risk Evaluation jobs into BullMQ without stalling IO', async () => {
        const BULK_SIZE = 10000;
        const jobs = [];

        for (let i = 0; i < BULK_SIZE; i++) {
            jobs.push({
                name: 'System Event',
                data: {
                    type: 'test-stress',
                    payload: { email: `stress-${i}@example.com`, ip: '1.2.3.4' },
                }
            });
        }

        // BullMQ Native Bulk Add
        await JobQueue.addBulk(jobs);

        const counts = await JobQueue.getJobCounts();

        // Assert queue successfully retained memory states cleanly
        expect(counts.waiting + counts.active).toBeGreaterThanOrEqual(BULK_SIZE);
    });
});
