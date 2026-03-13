import fetch from 'node-fetch';

const API = 'http://localhost:3001/auth/login'; // Phase 0 changed port to 3001
const EMAIL = 'attacker@test.com';
const PASSWORD = "definitely_wrong_password_123";

const TOTAL_REQUESTS = 50;          // Exceeds threshold dynamically
const CONCURRENCY = 25;             // Parallel promises
const DELAY_BETWEEN_BATCHES = 50;   // ms

async function fireRequest(i) {
    const start = Date.now();

    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: EMAIL,
                password: PASSWORD
            })
        });

        const end = Date.now();

        // We expect mostly 401s, maybe 429s due to rate limit
        return {
            index: i,
            status: res.status,
            latency: end - start
        };
    } catch (err) {
        return {
            index: i,
            error: err.message
        };
    }
}

async function runBurst() {
    console.log(`Starting burst attack... (${TOTAL_REQUESTS} requests, ${CONCURRENCY} at a time)`);
    const results = [];

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        const batch = [];

        for (let j = i; j < i + CONCURRENCY && j < TOTAL_REQUESTS; j++) {
            batch.push(fireRequest(j));
        }

        console.log(`Firing batch ${i} to ${i + CONCURRENCY - 1}...`);
        const settled = await Promise.allSettled(batch);
        results.push(...settled.map(r => r.value));

        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }

    console.log('Burst complete.');

    // Tally HTTP statuses
    const statuses = results.reduce((acc, curr) => {
        acc[curr.status || curr.error] = (acc[curr.status || curr.error] || 0) + 1;
        return acc;
    }, {});
    console.log('HTTP Status Tally:', statuses);

    console.log('\nWait a few seconds for BullMQ to process the events, then query alerts.');
}

runBurst();
