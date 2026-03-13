import { EventService } from '../src/services/event.service.js';
import { db } from '../src/lib/database.js';
import { redisClient } from '../src/lib/redis.js';
import { setupQueue } from '../src/queues/event.queue.js';

const ORG_ID = 'f5d90869-861d-4d66-8cd1-ac732cd0f48a'; // Acme Security Inc.

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('--- Starting Internal Sentinel Response Verification ---');
    
    // Ensure queue is ready
    setupQueue();

    // 1. Simulate Rapid Failed Logins (12 attempts)
    console.log('[SIM] Publishing 12 failed login events for unknown@acmecorp.com...');
    for (let i = 0; i < 12; i++) {
        await EventService.publish({
            organization_id: ORG_ID,
            event_type: 'login_failure',
            payload: {
                email: 'unknown@acmecorp.com',
                ip_address: '1.2.3.4',
                user_agent: 'Simulation-Agent-1.0',
                reason: 'wrong_password'
            }
        });
        await delay(50);
    }

    // 2. Simulate Directory Brute Force (12 probes)
    console.log('[SIM] Publishing 12 directory probe events for 5.6.7.8...');
    for (let i = 0; i < 12; i++) {
        await EventService.publish({
            organization_id: ORG_ID,
            event_type: 'directory_brute_force',
            payload: {
                ip_address: '5.6.7.8',
                url: `/probe-${i}.php`,
                user_agent: 'Simulation-Scanner-1.0'
            }
        });
        await delay(50);
    }

    console.log('[SIM] Waiting for worker to process events...');
    await delay(5000);

    const alerts = await db.query(
        "SELECT type, severity, entity, created_at FROM alerts WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5;",
        [ORG_ID]
    );

    console.log('\n--- Recent Alerts in Database ---');
    console.log(JSON.stringify(alerts.rows, null, 2));

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
