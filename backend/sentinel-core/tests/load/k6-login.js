import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
    scenarios: {
        credential_stuffing: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 1000,
            stages: [
                { target: 100, duration: '30s' }, // Ramp up to 100 requests per second (~6000/min)
                { target: 100, duration: '1m' },  // Sustain
                { target: 0, duration: '30s' },   // Ramp down
            ],
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<200'], // 95% of responses must be below 200ms
        http_req_failed: ['rate<0.1'],   // Error rate (500s) should be < 10% (429s excluded securely)
    },
};

export default function () {
    const url = 'http://localhost/auth/login';
    const payload = JSON.stringify({
        email: `botnet-${randomString(5)}@evasion.com`,
        password: 'password123',
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const res = http.post(url, payload, params);

    // Mapped Fastify Rate Limit (HTTP 429) bounces are considered successes computationally for Threat Intel limits
    check(res, {
        'Accepted or Throttled Safely': (r) => r.status === 200 || r.status === 401 || r.status === 429,
        'No Server Crashes (500)': (r) => r.status !== 500 && r.status !== 503,
    });
}
