import crypto from 'crypto';

const SENTINEL_URL = 'http://localhost:3001';
const API_KEY = 'sk_sentinel_hackathon_demo_key_2026';

async function logEvent(type, payload) {
    try {
        const res = await fetch(`${SENTINEL_URL}/events/log`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: type,
                payload
            })
        });
        if (!res.ok) {
            console.error(`[-] Failed to log ${type}: ${res.statusText}`);
        } else {
            console.log(`[+] Logged ${type}`);
        }
    } catch (e) {
        console.error(`[-] Error logging ${type}:`, e.message);
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function simulateRapidFailedLogins() {
    console.log('\n🔥 Simulating: RAPID_FAILED_LOGINS');
    const ip = '1.2.3.4';
    for (let i = 0; i < 10; i++) {
        await logEvent('login_failure', {
            ip_address: ip,
            email: 'victim@target.com',
            user_agent: 'Mozilla/5.0'
        });
        await sleep(50);
    }
}

async function simulateDirectoryBruteForce() {
    console.log('\n🔥 Simulating: DIRECTORY_BRUTE_FORCE');
    const paths = ['/admin', '/.env', '/config.php', '/wp-login.php', '/secrets.json', '/.git/config'];
    for (const path of paths) {
        await logEvent('http_request', {
            ip_address: '5.6.7.8',
            path,
            method: 'GET'
        });
        await sleep(50);
    }
}

async function simulateDistributedLogin() {
    console.log('\n🔥 Simulating: DISTRIBUTED_LOGIN');
    for (let i = 0; i < 12; i++) {
        const fakeIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        await logEvent('login_failure', {
            ip_address: fakeIp,
            email: 'ceo@target.com', 
            user_agent: 'Mozilla/5.0'
        });
        await sleep(50);
    }
}

async function simulatePasswordSpraying() {
    console.log('\n🔥 Simulating: PASSWORD_SPRAYING');
    const attackerIp = '10.20.30.40';
    for (let i = 0; i < 12; i++) {
        await logEvent('login_failure', {
            ip_address: attackerIp,
            email: `user${i}@target.com`,
            user_agent: 'Mozilla/5.0'
        });
        await sleep(50);
    }
}

async function simulateFingerprintCampaign() {
    console.log('\n🔥 Simulating: FINGERPRINT_CAMPAIGN');
    const probingIp = '192.168.1.100';
    for (let i = 0; i < 15; i++) {
        await logEvent('http_request', {
            ip_address: probingIp,
            path: '/api/v1/probe',
            method: 'OPTIONS',
            user_agent: 'Custom-Scanner-v1'
        });
        await sleep(50);
    }
}

async function simulateSecurityToolDetection() {
    console.log('\n🔥 Simulating: SECURITY_TOOL_DETECTION');
    await logEvent('scanner_detected', {
        ip_address: '1.3.3.7',
        threat_type: 'Nikto Scan',
        user_agent: 'nikto/2.1.6'
    });
}

async function simulateRiskScoringEffect() {
    console.log('\n🔥 Simulating: RISK_SCORING (Aggregate Alert)');
    await logEvent('login_failure', {
        ip_address: '9.9.9.9',
        email: 'admin@target.com',
        risk_score: 95
    });
}

async function runAll() {
    console.log('🚀 Starting Sentinel Security Simulation Suite...');
    await simulateSecurityToolDetection();
    await simulateRapidFailedLogins();
    await simulateDirectoryBruteForce();
    await simulateDistributedLogin();
    await simulatePasswordSpraying();
    await simulateFingerprintCampaign();
    await simulateRiskScoringEffect();
    console.log('\n✅ All simulations completed. Check your Sentinel Admin Dashboard!');
}

const arg = process.argv[2];
if (arg === '--all') {
    runAll();
} else {
    console.log('Use: node scripts/simulate_threats.js --all');
}
