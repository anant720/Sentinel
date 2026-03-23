// ═══════════════════════════════════════════════════════
//  Acme Corp Employee Portal — Backend Server
//  Sentinel Security Integration: server-side, hidden from users
// ═══════════════════════════════════════════════════════

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Sentinel Config (hidden from all users — server-side only) ──
const SENTINEL_URL = process.env.SENTINEL_URL || 'http://localhost:3001';
const SENTINEL_API_KEY = process.env.SENTINEL_API_KEY || 'sk_sentinel_JK5MJcSYT6Zw-VNLNNw2tsAqwD73C0IObWehSKIyPSQ';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

// Helper to get self URL for reporting
const getSelfUrl = (req) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    return `${protocol}://${host}`;
};

// ── Simulated Acme employee database ──
const EMPLOYEES = {
    'alice@acmecorp.com': { id: 'emp-001', name: 'Alice Johnson', role: 'Finance Lead', dept: 'Finance', password: bcrypt.hashSync('Alice@123', 10), avatar: 'AJ', color: '#6366f1' },
    'bob@acmecorp.com': { id: 'emp-002', name: 'Bob Carter', role: 'HR Manager', dept: 'Human Resources', password: bcrypt.hashSync('Bob@123', 10), avatar: 'BC', color: '#22c55e' },
    'charlie@acmecorp.com': { id: 'emp-003', name: 'Charlie Singh', role: 'Senior Engineer', dept: 'Engineering', password: bcrypt.hashSync('Charlie@123', 10), avatar: 'CS', color: '#f59e0b' },
    'diana@acmecorp.com': { id: 'emp-004', name: 'Diana Patel', role: 'Security Analyst', dept: 'Security', password: bcrypt.hashSync('Diana@123', 10), avatar: 'DP', color: '#ef4444' },
    'evan@acmecorp.com': { id: 'emp-005', name: 'Evan Wright', role: 'Product Manager', dept: 'Product', password: bcrypt.hashSync('Evan@123', 10), avatar: 'EW', color: '#8b5cf6' },
    'frank@acmecorp.com': { id: 'emp-006', name: 'Frank Miller', role: 'DevOps Engineer', dept: 'Engineering', password: bcrypt.hashSync('Frank@123', 10), avatar: 'FM', color: '#06b6d4' },
    'grace@acmecorp.com': { id: 'emp-007', name: 'Grace Lee', role: 'Marketing Specialist', dept: 'Marketing', password: bcrypt.hashSync('Grace@123', 10), avatar: 'GL', color: '#ec4899' },
    'henry@acmecorp.com': { id: 'emp-008', name: 'Henry Ford', role: 'Sales Executive', dept: 'Sales', password: bcrypt.hashSync('Henry@123', 10), avatar: 'HF', color: '#f97316' },
    'isabel@acmecorp.com': { id: 'emp-009', name: 'Isabel Rocha', role: 'Legal Counsel', dept: 'Legal', password: bcrypt.hashSync('Isabel@123', 10), avatar: 'IR', color: '#10b981' },
    'jack@acmecorp.com': { id: 'emp-010', name: 'Jack Daniels', role: 'Data Scientist', dept: 'Data', password: bcrypt.hashSync('Jack@123', 10), avatar: 'JD', color: '#3b82f6' },
};

// Track active sessions (in-memory for demo)
const activeSessions = new Map();

// ════════════════════════════════════════════════════════════════
//  🛡️  INTRUSION DETECTION ENGINE
//  Detects: dirb, nikto, sqlmap, hydra, nmap, burpsuite and more
// ════════════════════════════════════════════════════════════════

// Known hacking tool user-agent signatures
const SCANNER_UA_PATTERNS = [
    /dirb/i, /nikto/i, /sqlmap/i, /nmap/i, /masscan/i,
    /hydra/i, /medusa/i, /burpsuite/i, /zgrab/i, /gobuster/i,
    /wfuzz/i, /dirsearch/i, /nuclei/i, /metasploit/i, /acunetix/i,
    /nessus/i, /openvas/i, /python-requests/i, /go-http-client/i,
    /curl\/7\.\d+/i, /libwww-perl/i, /wget/i, /scrapy/i,
    /masscan/i, /censys/i, /shodan/i, /zaproxy/i,
];

// Suspicious path patterns that scanners probe
const SCANNER_PATH_PATTERNS = [
    /\.(php|asp|aspx|jsp|cgi|sh|bash|env|git|svn|bak|sql|conf|config|ini|log|xml|json|yaml|yml)$/i,
    /wp-admin|wp-login|wp-content|phpMyAdmin|phpmyadmin|adminer/i,
    /\/etc\/passwd|\/etc\/shadow|\/proc\/self/i,
    /\.\.\//,  // path traversal
    /union.*select|select.*from|drop.*table/i,  // SQL injection
    /<script|javascript:|onerror=/i,  // XSS probes
    /\/admin|\/administrator|\/manager|\/console|\/dashboard\/admin/i,
    /\/\.env|\/\.git|\/\.htaccess|\/\.htpasswd/i,
    /\/backup|\/dump|\/config|\/setup|\/install/i,
];

// Per-IP tracking (in-memory — use Redis in production)
const ipTracker = new Map(); // ip -> { requests: [], notFoundCount: int, alerted: Set }

// Clean up old entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [ip, data] of ipTracker.entries()) {
        data.requests = data.requests.filter(t => t > cutoff);
        if (data.requests.length === 0) ipTracker.delete(ip);
    }
}, 5 * 60 * 1000);

function getIpData(ip) {
    if (!ipTracker.has(ip)) {
        ipTracker.set(ip, { requests: [], notFoundCount: 0, alerted: new Set() });
    }
    return ipTracker.get(ip);
}

// ════════════════════════════════════════════════════════════════
//  SENTINEL INTEGRATION — invisible to employees
// ════════════════════════════════════════════════════════════════
const MOCK_LOCATIONS = [
    { city: 'San Francisco', country: 'US' },
    { city: 'New York', country: 'US' },
    { city: 'London', country: 'UK' },
    { city: 'Berlin', country: 'DE' },
    { city: 'Tokyo', country: 'JP' },
    { city: 'Sydney', country: 'AU' },
    { city: 'Toronto', country: 'CA' },
];

async function reportToSentinel(eventType, payload) {
    if (!SENTINEL_API_KEY || SENTINEL_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
        console.log(`[SENTINEL] ⚠ No API key — skipping: ${eventType}`);
        return;
    }

    // Inject stream_source and location into every event sent via API
    payload.stream_source = 'API';
    if (!payload.location) {
        // Consistent mock location based on IP address length/char to make it look stable per IP
        const ipString = payload.ip_address || '127.0.0.1';
        const locIndex = ipString.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % MOCK_LOCATIONS.length;
        payload.location = MOCK_LOCATIONS[locIndex];
    }
    try {
        const res = await fetch(`${SENTINEL_URL}/events/log`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENTINEL_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ event_type: eventType, payload }),
        });
        if (res.ok) {
            console.log(`[SENTINEL] ✅ ${eventType} reported`);
        } else {
            const err = await res.json().catch(() => ({}));
            console.log(`[SENTINEL] ❌ ${eventType} failed: ${res.status} — ${err.message || JSON.stringify(err)}`);
        }
    } catch (e) {
        console.log(`[SENTINEL] ⚠ Network error (is Sentinel running?): ${e.message}`);
    }
}

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ════════════════════════════════════════════════════════════════
//  🔍 INTRUSION DETECTION MIDDLEWARE — runs on EVERY request
// ════════════════════════════════════════════════════════════════
app.use(async (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || '';
    const url = req.originalUrl || req.url;

    const ipData = getIpData(ip);

    // ── 1. User-Agent Fingerprinting ────────────────────────────────
    const isScannerUA = SCANNER_UA_PATTERNS.some(p => p.test(ua));
    if (isScannerUA && !ipData.alerted.has('scanner_ua')) {
        ipData.alerted.add('scanner_ua');
        console.log(`[THREAT] 🚨 Scanner UA detected from ${ip}: ${ua}`);
        reportToSentinel('scanner_detected', {
            ip_address: ip,
            user_agent: ua,
            source_app: 'Acme Corp Employee Portal',
            destination: url,
            threat_type: 'Known Hacking Tool UA',
            risk_score: 85,
            details: `User-agent matches known scanner/hacking tool pattern`,
        });
    }

    // ── 2. Suspicious Path Probing ──────────────────────────────────
    const isSuspiciousPath = SCANNER_PATH_PATTERNS.some(p => p.test(url));
    if (isSuspiciousPath && !ipData.alerted.has(`path_${url}`)) {
        ipData.alerted.add(`path_${url}`);
        console.log(`[THREAT] 🚨 Suspicious path probe from ${ip}: ${url}`);
        reportToSentinel('path_scan_detected', {
            ip_address: ip,
            user_agent: ua,
            source_app: 'Acme Corp Employee Portal',
            destination: url,
            threat_type: 'Suspicious Path Probe',
            risk_score: 70,
            details: `Request to suspicious/sensitive path: ${url}`,
        });
    }

    // ── 3. Request Burst Detection (>60 req/min = scanner behaviour) ─
    const now = Date.now();
    ipData.requests.push(now);
    const oneMinAgo = now - 60000;
    const recentRequests = ipData.requests.filter(t => t > oneMinAgo);
    ipData.requests = recentRequests;

    if (recentRequests.length > 60 && !ipData.alerted.has('burst')) {
        ipData.alerted.add('burst');
        console.log(`[THREAT] 🚨 Burst scan from ${ip}: ${recentRequests.length} req/min`);
        reportToSentinel('burst_scan_detected', {
            ip_address: ip,
            user_agent: ua,
            source_app: 'Acme Corp Employee Portal',
            destination: url,
            threat_type: 'Request Burst / Directory Brute Force',
            requests_per_minute: recentRequests.length,
            risk_score: 90,
            details: `IP sent ${recentRequests.length} requests in 60 seconds`,
        });
    }

    // Reset burst alert after 2 min so repeated bursts are caught again
    if (recentRequests.length < 10 && ipData.alerted.has('burst')) {
        ipData.alerted.delete('burst');
    }

    // ── 4. 404 Flood Detection (dirb pattern) ──────────────────────
    // We listen to the response finish event to check the status code
    res.on('finish', () => {
        if (res.statusCode === 404) {
            ipData.notFoundCount = (ipData.notFoundCount || 0) + 1;
            if (ipData.notFoundCount === 10 && !ipData.alerted.has('404_flood')) {
                ipData.alerted.add('404_flood');
                console.log(`[THREAT] 🚨 404 flood from ${ip}: 10+ not-found responses`);
                reportToSentinel('directory_brute_force', {
                    ip_address: ip,
                    user_agent: ua,
                    source_app: 'Acme Corp Employee Portal',
                    destination: url,
                    threat_type: 'Directory Brute Force (404 Flood)',
                    not_found_count: ipData.notFoundCount,
                    risk_score: 80,
                    details: `IP triggered 10+ consecutive 404 errors — likely dirb/gobuster scan`,
                });
            }
        } else {
            // Reset 404 count on a successful response
            ipData.notFoundCount = 0;
        }
    });

    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ──
function requireAuth(req, res, next) {
    const token = req.cookies?.acme_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        req.employee = jwt.verify(token, JWT_SECRET);
        req.employee.token = token; // Keep token for reporting
        next();
    } catch {
        res.clearCookie('acme_token');
        res.status(401).json({ error: 'Session expired' });
    }
}

// ══════════════════════════
//  API ROUTES
// ══════════════════════════

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';

    const employee = EMPLOYEES[email?.toLowerCase()];

    if (!employee || !bcrypt.compareSync(password, employee.password)) {
        await reportToSentinel('login_failure', {
            email: email || 'unknown',
            reason: !employee ? 'user_not_found' : 'wrong_password',
            ip_address: ip,
            user_agent: ua,
            source_app: 'Acme Corp Employee Portal',
            destination: `${getSelfUrl(req)}/login`,
            risk_score: 40,
        });
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionId = `sess-${employee.id}-${Date.now()}`;
    activeSessions.set(sessionId, { email, loginAt: new Date().toISOString() });

    const token = jwt.sign(
        { id: employee.id, email, name: employee.name, role: employee.role, dept: employee.dept, avatar: employee.avatar, color: employee.color, sessionId },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.cookie('acme_token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
    });

    await reportToSentinel('login_success', {
        email,
        employee_name: employee.name,
        role: employee.role,
        department: employee.dept,
        ip_address: ip,
        user_agent: ua,
        source_app: 'Acme Corp Employee Portal',
        destination: `${getSelfUrl(req)}/dashboard`,
        risk_score: 0,
        jwt: token, // Pass JWT here
    });

    res.json({ success: true, name: employee.name.split(' ')[0], token });
});

// POST /api/logout
app.post('/api/logout', requireAuth, async (req, res) => {
    const { email, name, sessionId } = req.employee;
    const loginEntry = activeSessions.get(sessionId);
    const durationMin = loginEntry
        ? Math.round((Date.now() - new Date(loginEntry.loginAt).getTime()) / 60000)
        : 0;

    activeSessions.delete(sessionId);
    res.clearCookie('acme_token');

    await reportToSentinel('logout', {
        email,
        employee_name: name,
        session_duration_minutes: durationMin,
        ip_address: req.socket.remoteAddress,
        source_app: 'Acme Corp Employee Portal',
        destination: `${getSelfUrl(req)}/logout`,
    });

    res.json({ success: true });
});

// GET /api/me
app.get('/api/me', requireAuth, (req, res) => {
    const { email, name, role, dept, avatar, color } = req.employee;
    res.json({ email, name, role, dept, avatar, color });
});

// GET /api/team
app.get('/api/team', requireAuth, (req, res) => {
    const team = Object.entries(EMPLOYEES).map(([email, e]) => ({
        email,
        name: e.name,
        role: e.role,
        dept: e.dept,
        avatar: e.avatar,
        color: e.color,
        online: [...activeSessions.values()].some(s => s.email === email),
    }));
    res.json({ data: team });
});

// ── Real multi-page routes ──────────────────────────────────────
const PAGES = [
    'about', 'hr', 'finance', 'payroll', 'leave',
    'reports', 'directory', 'support', 'profile',
    'settings', 'help', 'docs', 'announcements',
    'projects', 'tasks', 'calendar', 'training'
];

// Each page returns its own styled HTML
function makePage(title, icon, content, req) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — Acme Corp</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#07070f;color:#f0f0ff;min-height:100vh;display:flex;flex-direction:column}
nav{height:56px;background:#0f0f1a;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;padding:0 28px}
.brand{font-weight:800;font-size:15px;display:flex;align-items:center;gap:10px}
.brand-icon{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#7c3aed);display:grid;place-items:center;font-size:13px}
.nav-links{display:flex;gap:8px}
.nav-links a{color:#5a6480;font-size:13px;text-decoration:none;padding:5px 10px;border-radius:6px;transition:all .15s}
.nav-links a:hover{color:#f0f0ff;background:rgba(255,255,255,.06)}
.content{flex:1;max-width:960px;width:100%;margin:0 auto;padding:40px 32px}
h1{font-size:26px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.sub{color:#5a6480;font-size:14px;margin-bottom:32px}
.card{background:#14141f;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:24px;margin-bottom:16px}
.card h2{font-size:14px;font-weight:700;color:#5a6480;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}
.item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}
.item:last-child{border-bottom:none}
.badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.green{background:rgba(34,197,94,.12);color:#4ade80}.red{background:rgba(239,68,68,.12);color:#f87171}.yellow{background:rgba(245,158,11,.12);color:#fbbf24}.blue{background:rgba(99,102,241,.12);color:#a5b4fc}
a.back{color:#6366f1;text-decoration:none;font-size:13px;font-weight:600}
</style>
</head>
<body>
<nav>
  <div class="brand"><div class="brand-icon">🏢</div>Acme Corp</div>
  <div class="nav-links">
    <a href="/">Home</a><a href="/hr">HR</a><a href="/finance">Finance</a>
    <a href="/payroll">Payroll</a><a href="/reports">Reports</a>
    <a href="/directory">Directory</a><a href="/settings">Settings</a>
  </div>
</nav>
<div class="content">
  <h1>${icon} ${title}</h1>
  <p class="sub"><a class="back" href="/">← Back to Portal</a></p>
  ${content}
</div>
</body>
</html>`;
}

app.get('/about', (req, res) => res.send(makePage('About', '🏢', `
<div class="card"><h2>Company Info</h2>
<div class="item"><span>Founded</span><span class="badge blue">2008</span></div>
<div class="item"><span>Employees</span><span class="badge green">1,240</span></div>
<div class="item"><span>Offices</span><span>New York · London · Singapore</span></div>
<div class="item"><span>Industry</span><span>Technology & Consulting</span></div>
</div>`, req)));

app.get('/hr', requireAuth, (req, res) => res.send(makePage('Human Resources', '👥', `
<div class="card"><h2>HR Modules</h2>
<div class="item"><span>📋 Employee Records</span><span class="badge green">Active</span></div>
<div class="item"><span>🏖️ Leave Management</span><span class="badge green">Active</span></div>
<div class="item"><span>📊 Performance Reviews</span><span class="badge yellow">Q2 Pending</span></div>
<div class="item"><span>🎓 Onboarding</span><span class="badge blue">3 In Progress</span></div>
</div>`, req)));

app.get('/finance', requireAuth, (req, res) => res.send(makePage('Finance', '💰', `
<div class="card"><h2>Financial Overview</h2>
<div class="item"><span>Q1 Revenue</span><span class="badge green">$4.2M</span></div>
<div class="item"><span>Operating Cost</span><span class="badge red">$2.8M</span></div>
<div class="item"><span>Net Profit</span><span class="badge green">$1.4M</span></div>
<div class="item"><span>Budget Utilization</span><span class="badge yellow">68%</span></div>
</div>`, req)));

app.get('/payroll', requireAuth, (req, res) => res.send(makePage('Payroll', '💳', `
<div class="card"><h2>March 2026 Payroll</h2>
<div class="item"><span>Status</span><span class="badge green">Processed</span></div>
<div class="item"><span>Payment Date</span><span>March 31, 2026</span></div>
<div class="item"><span>Total Disbursed</span><span class="badge blue">$380,000</span></div>
</div>
<div class="card"><h2>Your Payslip</h2>
<div class="item"><span>Basic Salary</span><span>$5,800</span></div>
<div class="item"><span>Allowances</span><span>$400</span></div>
<div class="item"><span>Tax Deducted</span><span class="badge red">-$820</span></div>
</div>`, req)));

app.get('/leave', requireAuth, (req, res) => res.send(makePage('Leave Management', '🏖️', `
<div class="card"><h2>My Leave Balance</h2>
<div class="item"><span>Annual Leave</span><span class="badge green">12 days left</span></div>
<div class="item"><span>Sick Leave</span><span class="badge green">6 days left</span></div>
<div class="item"><span>Casual Leave</span><span class="badge yellow">2 days left</span></div>
</div>
<div class="card"><h2>Recent Requests</h2>
<div class="item"><span>Mar 15–16</span><span class="badge yellow">Pending</span></div>
<div class="item"><span>Feb 3–7</span><span class="badge green">Approved</span></div>
</div>`, req)));

app.get('/reports', requireAuth, (req, res) => res.send(makePage('Reports', '📊', `
<div class="card"><h2>Available Reports</h2>
<div class="item"><span>📈 Monthly Security Summary</span><span class="badge blue">PDF</span></div>
<div class="item"><span>👥 Headcount Report</span><span class="badge blue">Excel</span></div>
<div class="item"><span>💰 Finance Dashboard</span><span class="badge blue">Live</span></div>
<div class="item"><span>🚨 Incident Log</span><span class="badge red">Restricted</span></div>
</div>`, req)));

app.get('/directory', requireAuth, (req, res) => res.send(makePage('Employee Directory', '📋', `
<div class="card"><h2>All Employees</h2>
<div class="item"><span>Alice Johnson</span><span class="badge blue">Finance Lead</span></div>
<div class="item"><span>Bob Carter</span><span class="badge green">HR Manager</span></div>
<div class="item"><span>Charlie Singh</span><span class="badge yellow">Senior Engineer</span></div>
<div class="item"><span>Diana Patel</span><span class="badge red">Security Analyst</span></div>
<div class="item"><span>Evan Wright</span><span class="badge blue">Product Manager</span></div>
</div>`, req)));

app.get('/support', (req, res) => res.send(makePage('IT Support', '🛠️', `
<div class="card"><h2>Raise a Ticket</h2>
<div class="item"><span>🖥️ Hardware Issues</span><span class="badge green">Available</span></div>
<div class="item"><span>🔑 Password Reset</span><span class="badge green">Self-Service</span></div>
<div class="item"><span>📧 Email Problems</span><span class="badge yellow">2hr SLA</span></div>
<div class="item"><span>🌐 Network Issues</span><span class="badge red">Critical Only</span></div>
</div>`, req)));

app.get('/profile', requireAuth, (req, res) => {
    const emp = req.employee;
    return res.send(makePage('My Profile', '👤', `
<div class="card"><h2>Account Info</h2>
<div class="item"><span>Email</span><span>${emp.email}</span></div>
<div class="item"><span>Role</span><span class="badge blue">${emp.role}</span></div>
<div class="item"><span>Department</span><span>${emp.dept}</span></div>
</div>`, req));
});

app.get('/settings', requireAuth, (req, res) => res.send(makePage('Settings', '⚙️', `
<div class="card"><h2>Account Settings</h2>
<div class="item"><span>Two-Factor Auth</span><span class="badge red">Disabled</span></div>
<div class="item"><span>Email Notifications</span><span class="badge green">Enabled</span></div>
<div class="item"><span>Theme</span><span class="badge blue">Dark</span></div>
</div>
<div class="card"><h2>Security</h2>
<div class="item"><span>Last Password Change</span><span>45 days ago</span></div>
<div class="item"><span>Active Sessions</span><span class="badge green">1</span></div>
</div>`, req)));

app.get('/help', (req, res) => res.send(makePage('Help Centre', '📚', `
<div class="card"><h2>Getting Started</h2>
<div class="item"><span>How to apply for leave</span><a href="/leave" style="color:#6366f1;font-size:12px">→ Open</a></div>
<div class="item"><span>View your payslip</span><a href="/payroll" style="color:#6366f1;font-size:12px">→ Open</a></div>
<div class="item"><span>Reset your password</span><a href="/support" style="color:#6366f1;font-size:12px">→ Open</a></div>
</div>`, req)));

app.get('/docs', (req, res) => res.send(makePage('Documentation', '📄', `
<div class="card"><h2>Internal Docs</h2>
<div class="item"><span>Employee Handbook v3.2</span><span class="badge blue">PDF</span></div>
<div class="item"><span>IT Security Policy</span><span class="badge red">Mandatory Read</span></div>
<div class="item"><span>Remote Work Guidelines</span><span class="badge green">Updated Feb 2026</span></div>
</div>`, req)));

app.get('/announcements', requireAuth, (req, res) => res.send(makePage('Announcements', '📢', `
<div class="card"><h2>Latest News</h2>
<div class="item"><span>🎉 Q1 Bonuses announced</span><span class="badge green">Mar 5</span></div>
<div class="item"><span>🏢 Office renovation schedule</span><span class="badge blue">Mar 1</span></div>
<div class="item"><span>🔒 Mandatory security training</span><span class="badge red">Due Mar 20</span></div>
</div>`, req)));

app.get('/projects', requireAuth, (req, res) => res.send(makePage('Projects', '📁', `
<div class="card"><h2>Active Projects</h2>
<div class="item"><span>Portal Redesign</span><span class="badge yellow">In Progress</span></div>
<div class="item"><span>ERP Migration</span><span class="badge blue">Planning</span></div>
<div class="item"><span>ISO 27001 Audit</span><span class="badge red">Urgent</span></div>
</div>`, req)));

app.get('/tasks', requireAuth, (req, res) => res.send(makePage('My Tasks', '✅', `
<div class="card"><h2>Open Tasks</h2>
<div class="item"><span>Review Q1 Finance Report</span><span class="badge red">Due Today</span></div>
<div class="item"><span>Complete Security Training</span><span class="badge yellow">Due Mar 20</span></div>
<div class="item"><span>Submit Leave Request</span><span class="badge green">No Deadline</span></div>
</div>`, req)));

app.get('/calendar', requireAuth, (req, res) => res.send(makePage('Calendar', '📅', `
<div class="card"><h2>Upcoming Events</h2>
<div class="item"><span>Mar 15 — Team Standup</span><span class="badge blue">10:00 AM</span></div>
<div class="item"><span>Mar 18 — Town Hall</span><span class="badge green">3:00 PM</span></div>
<div class="item"><span>Mar 25 — Q1 Review</span><span class="badge red">All Day</span></div>
</div>`, req)));

app.get('/training', requireAuth, (req, res) => res.send(makePage('Training', '🎓', `
<div class="card"><h2>Mandatory Courses</h2>
<div class="item"><span>Cybersecurity Awareness 2026</span><span class="badge red">Incomplete</span></div>
<div class="item"><span>Data Privacy — GDPR Refresh</span><span class="badge green">Completed ✓</span></div>
<div class="item"><span>Anti-Money Laundering</span><span class="badge yellow">In Progress</span></div>
</div>`, req)));

// ── Status endpoint ──
app.get('/api/status', (req, res) => res.json({
    status: 'ok', app: 'Acme Corp Portal', version: '1.0.0',
    uptime: process.uptime().toFixed(0) + 's',
    timestamp: new Date().toISOString(),
}));

// ── Catch-all: serve the SPA, but return 404 if it looks like a scanner probe ──
app.get('*', (req, res) => {
    const url = req.originalUrl || req.url;
    // If it's a known page or the root, it's a 200
    const isKnownPage = PAGES.includes(url.replace('/', '')) || url === '/';

    if (isKnownPage) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    // Otherwise, it's a 404 (important for directory brute force detection)
    res.status(404).send('Not Found');
});


// ── Start ──
app.listen(PORT, () => {
    console.log(`\n🏢 Acme Corp Portal running at http://localhost:${PORT}`);
    console.log(`🛡️  Sentinel at ${SENTINEL_URL}`);
    console.log(`🔍 Intrusion Detection Engine: ACTIVE`);
    console.log(`   Monitoring for: dirb, nikto, sqlmap, gobuster, hydra, nmap...`);
    if (SENTINEL_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
        console.log(`⚠  No API key set.\n`);
    } else {
        console.log(`✅  Sentinel API key configured.\n`);
    }
});
