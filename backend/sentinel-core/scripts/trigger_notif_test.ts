import { EventService } from '../src/services/event.service.js';
import { setupQueue } from '../src/queues/event.queue.js';

const ORG_ID = '1b7d66a3-9b8d-4e72-b4c2-3a83f7e36f6b'; // Acme Security Inc.

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('--- Triggering Alert for Notification Verification ---');
    setupQueue();

    // Trigger Directory Brute Force (High Severity)
    console.log('[SIM] Publishing directory probe events...');
    for (let i = 0; i < 15; i++) {
        await EventService.publish({
            organization_id: ORG_ID,
            event_type: 'directory_brute_force',
            payload: {
                ip_address: '9.9.9.9',
                url: `/verify-notif-${i}.php`,
                user_agent: 'Notif-Test-Agent'
            }
        });
        await delay(30);
    }

    console.log('[SIM] Done. Check the dashboard for toasts.');
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
