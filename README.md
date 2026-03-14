# 🛡️ Sentinel Security Platform
**Version 26.3.0 — A Personal Project by Anant Suthar**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org)

---

## 1️⃣ Project Overview

**Sentinel** is a professional-grade, multi-tenant **cybersecurity telemetry and monitoring platform** built from the ground up. It provides real-time visibility into an organization's security posture by tracking login failures, parsing API request streams, mapping geographic IP origins, and catching brute-force scanners before they breach the perimeter.

Built as a personal full-stack engineering project, Sentinel demonstrates:
- 🔴 **Live WebSocket threat streaming** — events appear on the SOC dashboard as they happen
- 🔐 **Dual-layer authentication** — JWT for analysts, API Keys for machine-to-machine ingestion
- 🏢 **Multi-tenant isolation** — every query is scoped to an `organization_id`
- ⚡ **BullMQ async processing** — high-throughput event ingestion without blocking the HTTP layer
- 🎯 **Configurable heuristic engine** — 7 pluggable detection rules, togglable per organization

> **What does Version 26.3.0 mean?**
> `26` = Year 2026, `3` = Month of March, `0` = Initial major release of this architecture.

> **Note on Data:** The backend database was hosted entirely locally during development for data security. Snapshots of real PostgreSQL tables generated during testing are available in [`frontend/sentinel-admin/README.md`](frontend/sentinel-admin/README.md).

---

## 2️⃣ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENTINEL PLATFORM v26.3.0                       │
│                                                                         │
│  ┌─────────────────┐     SDK Middleware      ┌────────────────────┐    │
│  │  demo/          │ ──── POST /events/log ──▶│  Sentinel Core     │    │
│  │  acme-portal    │     (API Key Auth)        │  (Fastify / Node)  │    │
│  │  :4000          │                           │  :3000             │    │
│  └─────────────────┘                           │                    │    │
│                                                │  ┌─────────────┐  │    │
│  ┌─────────────────┐     WebSocket Push        │  │  BullMQ     │  │    │
│  │  frontend/      │ ◀──── ws://localhost ─────│  │  Workers    │  │    │
│  │  sentinel-admin │                           │  └─────┬───────┘  │    │
│  │  :5173          │     REST API (JWT)         │        │          │    │
│  │  (React/Vite)   │ ◀──────────────────────── │  Detection Engine │    │
│  └─────────────────┘                           │  (7 Rules)        │    │
│                                                └────────┬───────────┘    │
│                                                         │               │
│                          ┌──────────────────────────────┤               │
│                          ▼                              ▼               │
│                  ┌──────────────┐             ┌──────────────────┐      │
│                  │  PostgreSQL  │             │  Redis           │      │
│                  │  (Primary DB)│             │  Pub/Sub + Cache │      │
│                  └──────────────┘             └──────────────────┘      │
│                                                                         │
│  Observability: Prometheus ──▶ Grafana                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technical Data Flow
1. **Ingest** — An attacker hits `demo/acme-portal`. The built-in SDK middleware fires a POST to `/events/log` with an API Key.
2. **Queue** — Fastify accepts the payload and pushes it to a BullMQ worker queue without blocking.
3. **Analyse** — A background worker runs the event through all 7 active detection rules, computing a `risk_score` (0–100).
4. **Persist** — The scored event is written to PostgreSQL. If score > alert threshold, a Security Alert row is created.
5. **Broadcast** — Redis publishes the new event to an open Pub/Sub channel.
6. **Visualise** — Every connected Sentinel Admin Console receives a WebSocket push — the analyst sees the event appear instantly, no refresh needed.

---

## 3️⃣ Feature List

### 🔴 Real-Time Threat Intelligence
- **Live WebSocket Event Stream** — Events appear on the SOC dashboard with sub-second latency
- **Security Alert Engine** — Automatically raises Critical/High/Warning alerts when risk thresholds are crossed
- **Risk Score Timeline** — Time-series chart of the organization's aggregate risk score

### 🛡️ Threat Detection (7 Rules)
| Rule | What It Catches |
|------|----------------|
| `security-tool-detection` | Known scanner User-Agents (Nikto, SQLMap, Masscan, etc.) |
| `rapid-failed-logins` | Burst of failed auth attempts from a single IP in a time window |
| `directory-brute-force` | Rapid probing of enumerable paths (`/admin`, `/wp-login`, etc.) |
| `distributed-login` | Login failures from many distinct IPs targeting the same account |
| `password-spraying` | Low-and-slow logins across many accounts from one IP |
| `fingerprint-campaign` | Systematic path/header probing indicating reconnaissance |
| `risk-scoring` | Aggregate behavioral risk index across all signal types |

### 🏢 Multi-Tenant Architecture
- Every API request is logically scoped to an `organization_id`
- Multiple organizations share one instance with zero data spillage
- Per-org API Key management with configurable rate limits

### 🔐 Identity & Access Management
| Role | Capabilities |
|------|-------------|
| `org_admin` | Full control — user management, API keys, detection settings |
| `security_analyst` | Manage alerts, read events, view detection config |
| `viewer` | Read-only access to events and resolved alerts |

### 📊 SOC Dashboard
- Detection velocity charts
- Top threats summary cards
- Alert status breakdown (Active / Acknowledged / Resolved / Dismissed)
- Live heatmap of event origins

### ⚙️ Configuration & Audit
- Toggle individual detection rules on/off per organization
- Configurable data retention policies
- Full organization-wide audit trail for all admin actions

---

## 4️⃣ Screenshots

### Dashboard & Analytics
> The nerve center. Immediate top-down visibility into detection velocity, critical threats, and historical risk trends.

![Dashboard](docs/screenshots/Dashboard.png)

### Live Telemetry Stream
> Watch events flow in via WebSockets in real-time, complete with payload origin maps and source application tags.

![Live Events](docs/screenshots/Live%20events.png)

### Security Alerts
> Actionable intelligence. When the backend risk-scoring engine flags an anomaly, it lands here for analysts to acknowledge, dismiss, or resolve.

![Security Alerts](docs/screenshots/Security%20alerts.png)

### Detection Logic Rules
> Configure the heuristics engine. Enable or disable specific attack signatures (e.g., Nikto scanner detection, directory brute-force mapping).

![Detection Logic](docs/screenshots/Detection%20logic.png)

### Identity & Access Management
> RBAC-protected user management. Control who has access to the SOC dashboard and at what permission level.

![Identity](docs/screenshots/Identity.png)

### Organization & API Keys
> Multi-tenant architecture. Manage API keys with rate-limiting constraints for ingest clients.

![Organization](docs/screenshots/Organization.png)

### Settings & Audit Logging
> Data retention policies and full organization-wide audit trails.

![Settings](docs/screenshots/Setting.png)

### Secure Login
> Hardware-backed secure entry point for administrators and analysts.

![Login Page](docs/screenshots/Login%20page.png)

---

## 5️⃣ Installation Guide

### Prerequisites
- **Node.js** v18 or newer
- **Docker & Docker Compose** (for PostgreSQL and Redis)
- **Git**

---

### Step 1 — Clone the Repository
```bash
git clone https://github.com/anant720/Sentinel.git
cd Sentinel
```

---

### Step 2 — Start Backend Infrastructure (Docker)
Sentinel requires PostgreSQL, PgBouncer, and Redis. Use the provided Compose file:

```bash
cd backend/sentinel-core

# Start the database and cache
docker-compose up -d db pgbouncer redis

# Copy the environment template
cp .env.example .env
```

Edit `.env` and set your PostgreSQL URL:
```env
DATABASE_URL=postgres://user:pass@localhost:5433/sentinel
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key_here
```

---

### Step 3 — Install Dependencies & Start the API
```bash
npm install
npm run dev
```
Fastify will bind to **`http://localhost:3000`** and initialize all database tables via the SQL migration runner.

---

### Step 4 — Seed an Organization & Admin Account
Because Sentinel is fully multi-tenant, you must provision an organization and an admin user before you can log in. Open a **new terminal** inside `backend/sentinel-core` and run:

```bash
node -e "
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();
  const orgId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const apiKeyId = crypto.randomUUID();

  const rawKey = 'sk_sentinel_' + crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, 14);

  await client.query(\`INSERT INTO organizations (id, name, slug, api_key_hash) VALUES (\$1, 'Acme Corp', 'acme-corp', \$2)\`, [orgId, keyHash]);

  const passwordHash = '\$2b\$12\$FCRTFQ9zhV8zzzx.46wXne5VvvPKuK7EzxP.M0lLPg3FexsI28USy'; // Sentinel@2026!
  await client.query(\`INSERT INTO users (id, organization_id, email, password_hash, full_name, role) VALUES (\$1, \$2, 'admin@sentinel.local', \$3, 'System Admin', 'org_admin')\`, [adminId, orgId, passwordHash]);

  await client.query(\`INSERT INTO api_keys (id, organization_id, key_hash, prefix, rate_limit_per_minute) VALUES (\$1, \$2, \$3, \$4, 1000)\`, [apiKeyId, orgId, keyHash, prefix]);

  console.log('\\n✅ Setup Complete!');
  console.log('Dashboard Login:  admin@sentinel.local');
  console.log('Dashboard Pass:   Sentinel@2026!');
  console.log('SECRET API KEY:  ', rawKey);
  await client.end();
}
seed().catch(console.error);
"
```

> **⚠️ Save the `SECRET API KEY`** printed by this script — you will need it in Step 7.

---

### Step 5 — Start the Admin Console (Frontend)
Open a **new terminal**:

```bash
cd frontend/sentinel-admin
npm install
npm run dev
```

Navigate to **`http://localhost:5173`** and log in with:
- **Email:** `admin@sentinel.local`
- **Password:** `Sentinel@2026!`

---

## 6️⃣ API Usage Example

Sentinel exposes a REST API secured by dual-layer authentication.

### Authentication
| Method | Header | Used For |
|--------|--------|---------|
| JWT Cookie | `acme_token` (HttpOnly) | Browser dashboard sessions |
| API Key | `Authorization: Bearer sk_sentinel_*` | Machine-to-machine event ingestion |

---

### Ingest a Security Event
```bash
curl -X POST http://localhost:3000/events/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_sentinel_YOUR_KEY_HERE" \
  -d '{
    "event_type": "login_failure",
    "payload": {
      "ip_address": "203.0.113.42",
      "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "email": "attacker@evil.com",
      "risk_score": 65
    }
  }'
```

**Response:**
```json
{ "status": "accepted", "queued": true }
```
`202 Accepted` — event is queued in BullMQ for async risk analysis.

---

### Fetch Paginated Events (Dashboard)
```bash
curl http://localhost:3000/events?page=1&limit=20 \
  -H "Cookie: acme_token=YOUR_JWT_HERE"
```

### Update Alert Status
```bash
# Resolve an alert
curl -X PATCH http://localhost:3000/alerts/ALERT_ID/resolve \
  -H "Cookie: acme_token=YOUR_JWT_HERE"

# Dismiss an alert
curl -X PATCH http://localhost:3000/alerts/ALERT_ID/dismiss \
  -H "Cookie: acme_token=YOUR_JWT_HERE"
```

### Fetch Detection Settings
```bash
curl http://localhost:3000/organizations/settings \
  -H "Cookie: acme_token=YOUR_JWT_HERE"
```

---

## 7️⃣ SDK Usage Example

Sentinel is designed to integrate invisibly into any existing application via a lightweight middleware SDK. The SDK intercepts inbound HTTP requests and asynchronously reports metadata to the Sentinel Core API.

### How the SDK Works
The `demo/acme-portal` contains the reference implementation. Here is the core SDK pattern you can adopt in any Express application:

```javascript
// sentinel-sdk.js — Drop this middleware into any Express app

const axios = require('axios');

function sentinelMiddleware(options) {
  const { sentinelUrl, apiKey } = options;

  return async function (req, res, next) {
    // Call next() immediately — never block the real request
    next();

    // Async fire-and-forget to Sentinel
    const payload = {
      event_type: 'http_request',
      payload: {
        ip_address: req.ip || req.headers['x-forwarded-for'] || '0.0.0.0',
        user_agent: req.headers['user-agent'] || 'unknown',
        path: req.path,
        method: req.method,
      }
    };

    axios.post(`${sentinelUrl}/events/log`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 3000,
    }).catch(() => {}); // Silent fail — never break the host app
  };
}

module.exports = { sentinelMiddleware };
```

### Integration — Mount in Your Express App
```javascript
const express = require('express');
const { sentinelMiddleware } = require('./sentinel-sdk');

const app = express();

// Mount before your routes — one line integration
app.use(sentinelMiddleware({
  sentinelUrl: 'http://localhost:3000',
  apiKey: 'sk_sentinel_YOUR_KEY_HERE',
}));

// ... your existing routes
app.get('/', (req, res) => res.send('Hello World'));
app.listen(4000);
```

### Reporting Authentication Events
For richer telemetry (login failures, brute-force detection), emit explicit events on auth outcomes:

```javascript
// On a failed login attempt:
await axios.post(`${SENTINEL_URL}/events/log`, {
  event_type: 'login_failure',
  payload: {
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    email: req.body.email,        // The attempted email
    risk_score: 45,               // Your app's initial estimate
  }
}, { headers: { Authorization: `Bearer ${API_KEY}` } });

// On a successful login:
await axios.post(`${SENTINEL_URL}/events/log`, {
  event_type: 'login_success',
  payload: {
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    email: user.email,
    role: user.role,
    risk_score: 0,
  }
}, { headers: { Authorization: `Bearer ${API_KEY}` } });
```

Sentinel's backend will then correlate these events across time, apply all 7 detection rules, and automatically raise Security Alerts when thresholds are crossed.

---

## 8️⃣ Demo Application Instructions

The `demo/acme-portal` is a fully functional, **intentionally vulnerable** mock corporate employee portal. It comes pre-wired with the Sentinel SDK and is the fastest way to see Sentinel in action.

### Setup

Open a **new terminal**:
```bash
cd demo/acme-portal
npm install
```

Create a `.env` file (or edit the existing one):
```env
PORT=4000
SENTINEL_URL=http://localhost:3000
SENTINEL_API_KEY=sk_sentinel_YOUR_KEY_FROM_STEP_4
```

Start the portal:
```bash
npm start
```

Navigate to **`http://localhost:4000`** — you'll see the Acme Corp employee login page.

---

### Generating Real-Time Telemetry

Keep the **Sentinel Admin Console** open at `http://localhost:5173/live-events`. Then try any of the following against the portal:

#### 🔴 Trigger a Scanner Detection (Critical Alert)
```bash
# Requires nikto to be installed
nikto -h http://localhost:4000
```
Within seconds, you'll see `scanner_detected` events streaming into the Live Events feed with **risk score 85**, and a **Critical Alert** raised automatically.

#### 🟠 Trigger a Directory Brute-Force Alert (High Alert)
```bash
# Requires dirb to be installed
dirb http://localhost:4000
```
Sentinel correlates the rapid path probing into a `directory-brute-force` Alert.

#### 🟡 Trigger Rapid Failed Login Detection
At `http://localhost:4000`, attempt **5+ failed logins** using fake email addresses (e.g., `hacker@test.com`, `admin@evil.com`). Watch `login_failure` events appear in real-time on the Sentinel dashboard. After enough failures, a **High severity Alert** is raised automatically.

#### ✅ Observe Normal Traffic
Simply browse the Acme Portal normally. Login with a valid account, view pages. These generate `login_success` and `http_request` events with **risk score 0–5**, showing the baseline/healthy traffic view.

---

### Real Data Snapshot

The following is actual telemetry captured during development testing:

| Event Type | Risk Score | Details |
|-----------|-----------|---------|
| `login_success` | 0 | Normal admin login from `127.0.0.1` |
| `scanner_detected` | 85 | `nikto` User-Agent string matched |
| `path_scan_detected` | 70 | Request to suspicious path `/wp-admin` |

Security Alerts generated:

| Type | Severity | Status |
|------|----------|--------|
| `security-tool-detection` | Critical | Resolved |
| `risk-scoring` | Critical | Resolved |
| `directory-brute-force` | High | Resolved |

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Fastify, TypeScript |
| **Database** | PostgreSQL (with table partitioning) |
| **Cache / Broker** | Redis (Pub/Sub + BullMQ queues) |
| **Frontend** | React 18, Vite, TailwindCSS |
| **State** | Zustand (auth), TanStack Query v5 (server) |
| **Real-Time** | WebSockets (native) + HTTP polling fallback |
| **Auth** | JWT (HttpOnly cookies) + SHA-256 API Keys |
| **Infra** | Docker, Docker Compose, Nginx, PgBouncer |
| **Monitoring** | Prometheus, Grafana, Alertmanager |

## System Components

| Component | Path | Port | Description |
|-----------|------|------|-------------|
| Sentinel Core API | `backend/sentinel-core` | `:3000` | Node.js/Fastify API + detection engine |
| Sentinel Admin Console | `frontend/sentinel-admin` | `:5173` | React SOC dashboard |
| Acme Demo Portal | `demo/acme-portal` | `:4000` | Vulnerable mock app with SDK |

## License

MIT License — see [LICENSE](LICENSE) for details.
