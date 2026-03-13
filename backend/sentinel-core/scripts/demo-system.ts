/**
 * Demo System — Simulated Application (Track 6.3)
 *
 * Simulates a login-failure brute-force attack on the Sentinel Core backend.
 * Demonstrates the full detection → alert lifecycle end to end.
 *
 * Requirements:
 *   - Docker stack running (npm run docker:up)
 *   - A test org + device provisioned (node --import tsx scripts/create_test_user.ts)
 *   - Replace DEVICE_ID, API_KEY, and PRIVATE_KEY below
 *
 * Run: npx tsx scripts/demo-system.ts
 */
import { createSign } from 'node:crypto';
import https from 'node:https';

const CONFIG = {
    BASE_URL: 'http://localhost:3000',
    API_KEY: 'sk_sentinel_YOUR_KEY_HERE',
    DEVICE_ID: 'YOUR_DEVICE_UUID',
    PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
... paste your device private key here ...
-----END PRIVATE KEY-----`,
};

function signPayload(payload: Record<string, unknown>): string {
    const signer = createSign('SHA256');
    signer.update(JSON.stringify(payload));
    signer.end();
    return signer.sign(CONFIG.PRIVATE_KEY, 'base64');
}

async function postEvent(eventType: string, payload: Record<string, unknown>) {
    const body = JSON.stringify({
        event_type: eventType,
        device_id: CONFIG.DEVICE_ID,
        timestamp: Date.now(),
        payload,
        signature: signPayload(payload),
    });

    const res = await fetch(`${CONFIG.BASE_URL}/events/ingest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.API_KEY}`,
        },
        body,
    });

    const data = await res.json() as { message: string; event_id: string };
    return { status: res.status, data };
}

async function main() {
    console.log('🎬 Sentinel Core Demo System');
    console.log('============================\n');

    const victimEmail = `victim_${Date.now()}@demo.com`;

    // Simulate 7 rapid login failures (threshold is 5)
    console.log(`📧 Simulating brute-force against: ${victimEmail}`);
    for (let i = 1; i <= 7; i++) {
        const payload = {
            user_id: 'attacker-001',
            timestamp: Date.now(),
            email: victimEmail,
            reason: 'invalid_password',
            attempt_count: i,
        };

        const result = await postEvent('login_failure', payload);
        console.log(`  [${i}/7] login_failure → ${result.status} — event_id: ${result.data.event_id ?? 'queued'}`);

        // Small delay between events (realistic timing)
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n⏳ Waiting 2s for detection engine to process...\n');
    await new Promise(r => setTimeout(r, 2000));

    // Show the user what alert was generated
    const alertsRes = await fetch(`${CONFIG.BASE_URL}/alerts?status=open&severity=high`, {
        headers: { 'Authorization': `Bearer ${CONFIG.API_KEY}` }
    });

    if (alertsRes.ok) {
        const alerts = await alertsRes.json() as { data: Array<{ id: string; type: string; severity: string; status: string }> };
        const count = alerts.data?.length ?? 0;
        console.log(`🚨 ${count} alert(s) generated:`);
        alerts.data?.forEach((a) => {
            console.log(`  • [${a.severity.toUpperCase()}] ${a.type} — status: ${a.status} (id: ${a.id})`);
        });
    } else {
        console.log('ℹ️  Could not fetch alerts (check JWT auth setup).');
    }

    console.log('\n✅ Demo complete! Visit Grafana at http://localhost:3001 to see ingestion metrics.');
}

main().catch(console.error);
